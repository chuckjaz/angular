# Copyright 2017 The Bazel Authors. All rights reserved.
#
# Licensed under the Apache License, Version 2.0 (the "License");
# you may not use this file except in compliance with the License.
# You may obtain a copy of the License at
#
#    http://www.apache.org/licenses/LICENSE-2.0
#
# Unless required by applicable law or agreed to in writing, software
# distributed under the License is distributed on an "AS IS" BASIS,
# WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
# See the License for the specific language governing permissions and
# limitations under the License.

load("@io_angular_rules_javascript//:defs.bzl", "ESMES2016Output")
load("@io_angular_rules_typescript//internal:build_defs.bzl", "tsc_wrapped_tsconfig",
  "default_compile_action")

load(
    "@io_angular_rules_typescript//internal:common/compilation.bzl",
    "COMMON_ATTRIBUTES", "compile_ts", "ts_providers_dict_to_struct",
    "collect_transitive_dts"
)

load("@io_angular_rules_typescript//internal:common/json_marshal.bzl", "json_marshal")

AngularMetadataOutput = provider()

# For each .ts file expect a .metadata.json file to be emitted (which can be empty)
def _expected_outs(ctx):
  result = []
  for src in ctx.files.srcs:
    if src.short_path.endswith(".ts"):
      basename = src.short_path[len(ctx.label.package) + 1:-3]
      result += [ctx.new_file(ctx.bin_dir, basename + '.metadata.json')]
  return result

def _compile_action(ctx, inputs, outputs, config_file_path, provider):
    if provider == ESMES2016Output:
        default_compile_action(ctx, inputs, outputs + _expected_outs(ctx), config_file_path, provider,
            "AngularMetadataCompile", "Compiling TypeScript with Angular metadata %s" % ctx.label)
    else:
        default_compile_action(ctx, inputs, outputs, config_file_path, provider)

def _ngc_tsconfig(ctx, files, srcs, provider, **kwargs):
  config = tsc_wrapped_tsconfig(ctx, files, srcs, provider, **kwargs)
  emitMetadata = provider == ESMES2016Output
  return dict(config, **{
      "angularCompilerOptions": {
          "expectedOut": [o.path for o in _expected_outs(ctx)] if emitMetadata else [],
          "skipMetadataEmit": not emitMetadata,
          "skipTemplateCodegen": True,
          "angularFilesOnly": ctx.attr.write_ng_outputs_only,
      }
  })

def _produce_metadata_only(ctx, outputs):
  # Calculate the inputs necessary for the compiler
  # TODO(chuckj): This is a duplicate of the code from compilization.bzl and should be refactored to be shared.
  src_declarations = []  # d.ts found in inputs.
  # Compile the sources, if any.  (For a ts_declaration rule this will
  # type-check the d.ts sources and potentially generate externs.)
  for src in ctx.attr.srcs:
    # 'x/y.ts' ==> 'x/y.js'
    if src.label.package != ctx.label.package:
      # Sources can be in sub-folders, but not in sub-packages.
      fail("Sources must be in the same package as the ts_library rule, " +
           "but %s is not in %s" % (src.label, ctx.label.package), "srcs")

    for f in src.files:
      if f.path.endswith(".d.ts"):
        src_declarations += [f]
        continue

  transitive_dts = collect_transitive_dts(ctx)
  tsconfig_json = ctx.new_file(ctx.label.name + "_angular_metadata_tsconfig.json")
  inputs = transitive_dts.transitive_declarations + ctx.files.srcs
  tsconfig = _ngc_tsconfig(ctx, inputs, ctx.files.srcs, AngularMetadataOutput,
    # These actually don't matter as the .js files are not emitted.
    target = "ES2016",
    module = "es2015",
    suffix = "metadata"
  )
  tsconfig["compilerOptions"]["declaration"] = False
  ctx.file_action(output=tsconfig_json, content=json_marshal(tsconfig))
  default_compile_action(ctx, inputs + [tsconfig_json], outputs, tsconfig_json.path,
    AngularMetadataOutput,
    "AngularMetadata",
    "Producing Angular metadata for %s" % ctx.label)

def _ng_library_impl(ctx):
  """Implementation of ng_library.
  Args:
    ctx: the context.
  Returns:
    the struct returned by the call to compile_ts.
  """
  # An ng_library is a ts_library that can emit metadata.
  metadata_files = AngularMetadataOutput(files = depset(_expected_outs(ctx)))
  if ctx.attr.write_ng_outputs_only:
    _produce_metadata_only(ctx, metadata_files.files)
    return struct(
        files = metadata_files.files,
        providers = [metadata_files]
    )
  else:
    ts_providers = compile_ts(ctx, is_library=True,
                               compile_action=_compile_action,
                               devmode_compile_action=_compile_action,
                               tsc_wrapped_tsconfig=_ngc_tsconfig)
    ts_providers["providers"] += [metadata_files]
    return ts_providers_dict_to_struct(ts_providers)

ng_library = rule(
    implementation = _ng_library_impl,
    attrs = dict(COMMON_ATTRIBUTES, **{
        "srcs": attr.label_list(allow_files = True),

        # To be used only to bootstrap @angular/core compilation,
        # since we want to compile @angular/core with ngc, but ngc depends on
        # @angular/core typescript output.
        "write_ng_outputs_only": attr.bool(default = False),
        "tsconfig": attr.label(allow_files = True, single_file = True),
        # TODO(alexeagle): enable workers for ngc
        "supports_workers": attr.bool(default = False),
        "compiler": attr.label(
            default = Label("//internal/ngc"),
            executable = True,
            cfg = "host",
        ),
        # @// is special syntax for the "main" repository
        # The default assumes the user specified a target "node_modules" in their
        # root BUILD file.
        "node_modules": attr.label(
            default = Label("@//:node_modules")
        ),
    }),
)
