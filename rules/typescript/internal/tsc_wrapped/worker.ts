import * as path from 'path';
/* tslint:disable:no-require-imports */
const protobufjs = require('protobufjs');
const ByteBuffer = require('bytebuffer');

protobufjs.convertFieldsToCamelCase = true;

const DEBUG = false;

export function debug(...args: Array<{}>) {
  if (DEBUG) console.error.apply(console, args);
}

/**
 * Write a message to stderr, which appears in the bazel log and is visible to
 * the end user.
 */
export function log(...args: Array<{}>) {
  console.error.apply(console, args);
}

export function runAsWorker(args: string[]) {
  return args.indexOf('--persistent_worker') !== -1;
}

const proto = `
syntax = "proto3";

package blaze.worker;

option java_package = "com.google.devtools.build.lib.worker";

// An input file.
message Input {
  // The path in the file system where to read this input artifact from. This is
  // either a path relative to the execution root (the worker process is
  // launched with the working directory set to the execution root), or an
  // absolute path.
  string path = 1;

  // A hash-value of the contents. The format of the contents is unspecified and
  // the digest should be treated as an opaque token.
  bytes digest = 2;
}

// This represents a single work unit that Bazel sends to the worker.
message WorkRequest {
  repeated string arguments = 1;

  // The inputs that the worker is allowed to read during execution of this
  // request.
  repeated Input inputs = 2;
}

// The worker sends this message to Bazel when it finished its work on the
// WorkRequest message.
message WorkResponse {
  int32 exit_code = 1;

  // This is printed to the user after the WorkResponse has been received and is supposed to contain
  // compiler warnings / errors etc. - thus we'll use a string type here, which gives us UTF-8
  // encoding.
  string output = 2;
}`;

const workerpb = (function loadWorkerPb() {
  const protoNamespace = protobufjs.loadProto(proto, 'worker_protocol.proto');
  if (!protoNamespace) {
    throw new Error('Cannot find parse proto');
  }
  return protoNamespace.build('blaze.worker');
})();

interface Input {
  getPath(): string;
  getDigest(): {toString(encoding: string): string};  // npm:ByteBuffer
}
interface WorkRequest {
  getArguments(): string[];
  getInputs(): Input[];
}

export function runWorkerLoop(
    runOneBuild: (args: string[], inputs?: {[path: string]: string}) =>
        boolean) {
  // Hook all output to stderr and write it to a buffer, then include
  // that buffer's in the worker protcol proto's textual output.  This
  // means you can log via console.error() and it will appear to the
  // user as expected.
  let consoleOutput = '';
  process.stderr.write =
      (chunk: string | Buffer, ...otherArgs: any[]): boolean => {
        consoleOutput += chunk.toString();
        return true;
      };

  // Accumulator for asynchronously read input.
  // tslint:disable-next-line:no-any protobufjs is untyped
  let buf: any;
  process.stdin.on('readable', () => {
    const chunk = process.stdin.read();
    if (!chunk) return;

    const wrapped = ByteBuffer.wrap(chunk);
    buf = buf ? ByteBuffer.concat([buf, wrapped]) : wrapped;
    try {
      let req: WorkRequest;
      // Read all requests that have accumulated in the buffer.
      while ((req = workerpb.WorkRequest.decodeDelimited(buf)) != null) {
        debug('=== Handling new build request');
        // Reset accumulated log output.
        consoleOutput = '';
        const args = req.getArguments();
        const inputs: {[path: string]: string} = {};
        for (const input of req.getInputs()) {
          inputs[input.getPath()] = input.getDigest().toString('hex');
        }
        debug('Compiling with:\n\t' + args.join('\n\t'));
        const exitCode = runOneBuild(args, inputs) ? 0 : 1;
        process.stdout.write(new workerpb.WorkResponse()
                                 .setExitCode(exitCode)
                                 .setOutput(consoleOutput)
                                 .encodeDelimited()
                                 .toBuffer());

        // Force a garbage collection pass.  This keeps our memory
        // usage consistent across multiple compilations, and allows
        // the file cache to use the current memory usage as a
        // guideline for expiring data.
        global.gc();
      }
      // Avoid growing the buffer indefinitely.
      buf.compact();
    } catch (e) {
      log('Compilation failed', e.stack);
      process.stdout.write(new workerpb.WorkResponse()
                               .setExitCode(1)
                               .setOutput(consoleOutput)
                               .encodeDelimited()
                               .toBuffer());
      // Clear buffer so the next build won't read an incomplete request.
      buf = null;
    }
  });
  process.stdin.on('end', () => {
    log('Exiting TypeScript compiler persistent worker.');
    process.exit(0);
  });
}
