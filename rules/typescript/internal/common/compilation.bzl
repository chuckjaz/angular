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

"""Used for compilation by the different implementations of build_defs.bzl.
"""

load(":common/module_mappings.bzl", "module_mappings_aspect")
load(":common/json_marshal.bzl", "json_marshal")
load("@io_angular_rules_javascript//:defs.bzl", "ClosureES2015Output", "ESMES2015Output", "ESMES2016Output", "CommonJSEs5Output")

BASE_ATTRIBUTES = dict()

# Attributes shared by any typescript-compatible rule (ts_library, ng_module)
COMMON_ATTRIBUTES = dict(BASE_ATTRIBUTES, **{
    "deps": attr.label_list(aspects = [
      module_mappings_aspect,
    ]),
    "data": attr.label_list(
        default = [],
        allow_files = True,
        cfg = "data",
    ),
    # TODO(evanm): make this the default and remove the option.
    "runtime": attr.string(default="browser"),
    # Used to determine module mappings
    "module_name": attr.string(),
    "module_root": attr.string(),
    "module": attr.string(default = "commonjs"),
    # TODO(radokirov): remove this attr when clutz is stable enough to consume
    # any closure JS code.
    "runtime_deps": attr.label_list(
        default = [],
        providers = ["js"],
    ),
    # Override _additional_d_ts to specify google3 stdlibs
    "_additional_d_ts": attr.label_list(
        allow_files = True,
    ),
    # Whether to generate externs.js from any "declare" statement.
    "generate_externs": attr.bool(default = True),
})

TypeScriptDeclarations = provider()
TypeScriptTransitiveDeclarations = provider()

EMIT_OPTIONS = dict({
  ClosureES2015Output: struct(
    name = "es6",
    module = "es2015",
    target = "ES2015",
    suffix = "closure",
  ),
  ESMES2015Output: struct(
    name = "es5",
    module = "es2015",
    target = "ES5",
    suffix = "es5",
  ),
  ESMES2016Output: struct(
    name = "umd",
    module = "umd",
    target = "ES5",
    suffix = "umd",
    dev_mode = True,
  ),
  CommonJSEs5Output: struct(
    name = "common",
    module = "commonjs",
    target = "ES5",
    suffix = "",
  )
})

def _dev_mode(options):
  return hasattr(options, "dev_mode") and options.dev_mode

SUPPORTED_OUTPUTS = [ClosureES2015Output, ESMES2015Output, ESMES2016Output, CommonJSEs5Output]

# TODO(plf): Enforce this at analysis time.
def assert_js_or_typescript_deps(ctx):
  for dep in ctx.attr.deps:
    if not hasattr(dep, "typescript") and not hasattr(dep, "js"):
      fail(
          ("%s is neither a TypeScript nor a JS producing rule." % dep.label) +
          "\nDependencies must be ts_library, ts_declaration, or " +
          # TODO(plf): Leaving this here for now, but this message does not
          # make sense in opensource.
          "JavaScript library rules (js_library, pinto_library, etc, but " +
          "also proto_library and some others).\n")

def _collect_transitive_dts(ctx):
  all_deps_declarations = set()
  type_blacklisted_declarations = set()
  for extra in ctx.files._additional_d_ts:
    all_deps_declarations += set([extra])
  for dep in ctx.attr.deps:
    if hasattr(dep, "typescript"):
      all_deps_declarations += dep.typescript.transitive_declarations
      type_blacklisted_declarations += (
          dep.typescript.type_blacklisted_declarations)
  return struct(
      transitive_declarations=list(all_deps_declarations),
      type_blacklisted_declarations=list(type_blacklisted_declarations)
  )

def _output_basename(ctx, label, input_file):
  """Returns base output name for |input_file|.
  Args:
    ctx: ctx.
    label: Label. package label.
    input_file: File. the input_file
  Returns:
    the base name of an output file
  """
  workspace_segments = label.workspace_root.split("/") if label.workspace_root else []
  package_segments = label.package.split("/") if label.package else []
  trim = len(workspace_segments) + len(package_segments)
  basename = "/".join(input_file.short_path.split("/")[trim:])
  dot = basename.rfind(".")
  return basename[:dot]

def _enter_output(ctx, outputs, output, basename, suffix = "", ext = None):
  ext = ext if ext else "." + suffix + ".js" if suffix != "" else ".js"
  file = ctx.new_file(basename + ext)
  outputs[output] = outputs[output] + [file] if output in outputs else [file]

def compile_ts(ctx,
               is_library,
               extra_dts_files=[],
               compile_action=None,
               devmode_compile_action=None,
               jsx_factory=None,
               tsc_wrapped_tsconfig=None):
  """Creates actions to compile TypeScript code.
  This rule is shared between ts_library and ts_declaration.
  Args:
    ctx: ctx.
    is_library: boolean. False if only compiling .dts files.
    extra_dts_files: list. Additional dts files to pass for compilation,
      not included in the transitive closure of declarations.
    compile_action: function. Creates the compilation action.
    devmode_compile_action: function. Creates the compilation action
      for devmode.
    jsx_factory: optional string. Enables overriding jsx pragma.
    tsc_wrapped_tsconfig: function that produces a tsconfig object.
  Returns:
    struct that will be returned by the rule implementation.
  """
  assert_js_or_typescript_deps(ctx)

  ### Collect srcs and outputs.
  srcs = ctx.files.srcs
  transpiled_closure_js = []
  transpiled_devmode_js = []
  src_declarations = []  # d.ts found in inputs.
  gen_declarations = []  # d.ts generated by the TypeScript compiler.
  tsickle_externs = []  # externs.js generated by tsickle, if any.
  has_sources = False
  outputs = dict() # dictionary to collect output files

  # Compile the sources, if any.  (For a ts_declaration rule this will
  # type-check the d.ts sources and potentially generate externs.)
  for src in ctx.attr.srcs:
    # 'x/y.ts' ==> 'x/y.js'
    if src.label.package != ctx.label.package:
      # Sources can be in sub-folders, but not in sub-packages.
      fail("Sources must be in the same package as the ts_library rule, " +
           "but %s is not in %s" % (src.label, ctx.label.package), "srcs")

    for f in src.files:
      has_sources = True
      if not is_library and not f.path.endswith(".d.ts"):
          fail("srcs must contain only type declarations (.d.ts files), " +
               "but %s contains %s" % (src.label, f.short_path), "srcs")
      if f.path.endswith(".d.ts"):
        src_declarations += [f]
        continue

      output_basename = _output_basename(ctx, src.label, f)
      for output in SUPPORTED_OUTPUTS:
        suffix = EMIT_OPTIONS[output].suffix
        _enter_output(ctx, outputs, output, output_basename, suffix=suffix)
      _enter_output(ctx, outputs, TypeScriptDeclarations, output_basename, ext=".d.ts")
  
  # TODO(chuckj): Re-enabled production of .extern.js 
  # if has_sources and ctx.attr.runtime != "nodejs":
  #   # Note: setting this variable controls whether tsickle is run at all.
  #   tsickle_externs = [ctx.new_file(ctx.label.name + ".externs.js")]

  transitive_dts = _collect_transitive_dts(ctx)
  input_declarations = transitive_dts.transitive_declarations + src_declarations
  type_blacklisted_declarations = transitive_dts.type_blacklisted_declarations
  if not is_library and not ctx.attr.generate_externs:
    type_blacklisted_declarations += ctx.files.srcs

  # A manifest listing the order of this rule's *.ts files (non-transitive)
  # Only generated if the rule has any sources.
  devmode_manifest = ctx.new_file(ctx.label.name + ".es5.MF")

  if has_sources:
    compilation_inputs = input_declarations + extra_dts_files + srcs
    tsickle_externs_path = tsickle_externs[0] if tsickle_externs else None

    # Calculate allowed dependencies for strict deps enforcement.
    allowed_deps = srcs  # A target's sources may depend on each other.
    for dep in ctx.attr.deps:
      if hasattr(dep, "typescript"):
        allowed_deps += dep.typescript.declarations
    allowed_deps += extra_dts_files


    # Create the actions that produce the supported output formats
    for output in SUPPORTED_OUTPUTS:
      options = EMIT_OPTIONS[output]
      tsconfig_json = ctx.new_file(ctx.label.name + "_" + options.name + "_tsconfig.json")
      tsconfig = tsc_wrapped_tsconfig(
        ctx,
        compilation_inputs,
        srcs,
        options.target,
        options.module,
        options.suffix,
        jsx_factory=jsx_factory,
        devmode_manifest=devmode_manifest.path if _dev_mode(options) else None,
        tsickle_externs=tsickle_externs_path,
        type_blacklisted_declarations=type_blacklisted_declarations,
        allowed_deps=allowed_deps)

      # Produce the output .d.ts files when producing the dev_mode output
      # This reduces the number of actions necessary for development turn-around
      if not _dev_mode(options):
        tsconfig["compilerOptions"]["declaration"] = False
      ctx.file_action(output=tsconfig_json, content=json_marshal(tsconfig))
      
      action_inputs = compilation_inputs + [tsconfig_json]
      action_outputs = outputs[output] + ((outputs[TypeScriptDeclarations] + [devmode_manifest]) if _dev_mode(options) else [])
      compile_action(ctx, action_inputs, action_outputs, tsconfig_json.path)

  gen_declarations = outputs[TypeScriptDeclarations] if TypeScriptDeclarations in outputs else []

  # TODO(martinprobst): Merge the generated .d.ts files, and enforce strict
  # deps (do not re-export transitive types from the transitive closure).
  transitive_decls = input_declarations + gen_declarations

  if is_library:
    es6_sources = set(outputs[ClosureES2015Output] + tsickle_externs)
    es5_sources = set(outputs[CommonJSEs5Output])
  else:
    es6_sources = set(tsickle_externs)
    es5_sources = set(tsickle_externs)
    devmode_manifest = None

  # Downstream rules see the .d.ts files produced or declared by this rule.
  declarations = gen_declarations + src_declarations
  if not srcs:
    # Re-export sources from deps.
    # TODO(b/30018387): introduce an "exports" attribute.
    for dep in ctx.attr.deps:
      if hasattr(dep, "typescript"):
        declarations += dep.typescript.declarations

  # Construct the list of output files, which are the files that are
  # always built (including e.g. if you "blaze build :the_target"
  # directly).  If this is a ts_declaration, add tsickle_externs to the
  # outputs list to force compilation of d.ts files.  (tsickle externs
  # are produced by running a compilation over the d.ts file and
  # extracting type information.)
  files = set(declarations)
  if not is_library:
    files += set(tsickle_externs)

  providers = ([output(files = outputs[output]) for output in (SUPPORTED_OUTPUTS + 
    [TypeScriptDeclarations])] +
    [TypeScriptTransitiveDeclarations(files = transitive_dts)])

  return {
      "files": files,
      "providers": providers,
      "runfiles": ctx.runfiles(
          # Note: don't include files=... here, or they will *always* be built
          # by any dependent rule, regardless of whether it needs them.
          # But these attributes are needed to pass along any input runfiles:
          collect_default=True,
          collect_data=True,
      ),
      # TODO(martinprobst): Prune transitive deps, only re-export what's needed.
      "typescript": {
          "declarations": declarations, # Deprecated. Use ypescriptDeclarations provider instead
          "transitive_declarations": transitive_decls, # Deprecated. Use TransitiveTypescriptDeclarations provider instead
          "es6_sources": es6_sources, # Deprecated. Use ClosureES2015Output provider instead
          "es5_sources": es5_sources, # Deprecated. Use CommonJSEs5Output provider instead
          "devmode_manifest": devmode_manifest,
          "type_blacklisted_declarations": type_blacklisted_declarations,
          "tsickle_externs": tsickle_externs,
      },
      # Expose the tags so that a Skylark aspect can access them.
      "tags": ctx.attr.tags,
      "instrumented_files": {
          "extensions": ["ts"],
          "source_attributes": ["srcs"],
          "dependency_attributes": ["deps", "runtime_deps"],
      },
  }

# Converts a dict to a struct, recursing into a single level of nested dicts.
# This allows users of compile_ts to modify or augment the returned dict before
# converting it to an immutable struct.
def ts_providers_dict_to_struct(d):
  for key, value in d.items():
    if type(value) == type({}):
      d[key] = struct(**value)
  return struct(**d)
  