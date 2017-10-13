# Copyright Google Inc. All Rights Reserved.
#
# Use of this source code is governed by an MIT-style license that can be
# found in the LICENSE file at https://angular.io/license

load(":rules_typescript.bzl",
    "tsc_wrapped_tsconfig",
    "COMMON_ATTRIBUTES",
    "COMMON_OUTPUTS",
    "compile_ts",
    "DEPS_ASPECTS",
    "ts_providers_dict_to_struct",
    "json_marshal",
)

load(":ng_module.bzl", "ngc_compile_action")

ModuleId = provider()

# Calculate the expected output of the compiler for every source in in the library.
# Most of these will be produced as empty files but it is unknown, without parsing, 
# which will be empty.
def _expected_outs(ctx, label):
  devmode_js_files = []
  closure_js_files = []
  declaration_files = []
  metadata_files = []

  codegen_inputs = ctx.files.srcs

  for src in ctx.files.srcs:
    devmode_js = []
    
    if src.short_path.endswith(".ts") and not src.short_path.endswith(".d.ts"):
      basename = src.short_path[len(ctx.label.package) + 1:-len(".ts")]
      
      devmode_js = [
          ".js",
      ]
      metadata = [
          ".metadata.json"
      ]

      closure_js = [f.replace(".js", ".closure.js") for f in devmode_js]
      declarations = [f.replace(".js", ".d.ts") for f in devmode_js]

      devmode_js_files += [ctx.new_file(ctx.bin_dir, basename + ext) for ext in devmode_js]
      closure_js_files += [ctx.new_file(ctx.bin_dir, basename + ext) for ext in closure_js]
      declaration_files += [ctx.new_file(ctx.bin_dir, basename + ext) for ext in declarations]
      metadata_files += [ctx.new_file(ctx.bin_dir, basename + ext) for ext in metadata]

  return struct(
    closure_js = closure_js_files,
    devmode_js = devmode_js_files,
    declarations = declaration_files,
    metadata = metadata_files,
  )

def _ngc_tsconfig(ctx, files, srcs, **kwargs):
  outs = _expected_outs(ctx, ctx.label)
  if "devmode_manifest" in kwargs:
    expected_outs = outs.devmode_js + outs.declarations + outs.metadata
  else:
    expected_outs = outs.closure_js

  return dict(tsc_wrapped_tsconfig(ctx, files, srcs, **kwargs), **{
      "angularCompilerOptions": {
          "generateCodeForLibraries": False,
          "strictMetadataEmit": False,
          "skipTemplateCodegen": True,
          # FIXME: wrong place to de-dupe
          "expectedOut": depset([o.path for o in expected_outs]).to_list()
      }
  })

def _compile_action(ctx, inputs, outputs, messages_out, config_file_path):
  action_inputs = []
  if hasattr(ctx.attr, "node_modules"):
    action_inputs += inputs + [f for f in ctx.files.node_modules
                      if f.path.endswith(".ts") or f.path.endswith(".json")]
  if hasattr(ctx.attr, "tsconfig") and ctx.file.tsconfig:
    action_inputs += [ctx.file.tsconfig]

  return ngc_compile_action(ctx, ctx.label, action_inputs, outputs, messages_out, config_file_path)

def _prodmode_compile_action(ctx, inputs, outputs, config_file_path):
  outs = _expected_outs(ctx, ctx.label)
  return _compile_action(ctx, inputs, outputs + outs.closure_js, None, config_file_path)

def _devmode_compile_action(ctx, inputs, outputs, config_file_path):
  outs = _expected_outs(ctx, ctx.label)
  return _compile_action(ctx, inputs, outputs + outs.devmode_js + outs.declarations + outs.metadata, None, config_file_path)

def ng_library_impl(ctx, ts_compile_actions):
  """Implementation of ng_library.
  Args:
    ctx: the context.
    ts_compiler_actions: a ts compiler action provided by ts_provider_dict_to_struct
  Returns:
    the struct returned by the call to compile_ts.
  """
  # An ng_library is a ts_library that can emit metadata.
  providers = ts_compile_actions(
      ctx, is_library=True,
      compile_action=_prodmode_compile_action,
      devmode_compile_action=_devmode_compile_action,
      tsc_wrapped_tsconfig=_ngc_tsconfig,
      outputs = _expected_outs)

  outs = _expected_outs(ctx, ctx.label)
  providers["angular"] = {
    "metadata": outs.metadata
  }

  if hasattr(ctx.attr, "module_name"):
    if "providers" in providers:
      providers["providers"] += [ModuleId(id = ctx.attr.module_name)]
    else:
      providers["providers"] = [ModuleId(id = ctx.attr.module_name)]

  return providers

def _ng_library_impl(ctx):
  return ts_providers_dict_to_struct(ng_library_impl(ctx, compile_ts))

NG_LIBRARY_ATTRIBUTES = {
    "srcs": attr.label_list(allow_files = True),

    "compiler": attr.label(
        default = Label("//src/ngc-wrapped"),
        executable = True,
        cfg = "host",
    ),

    "no_i18n": attr.bool(default = True),

    "_supports_workers": attr.bool(default = True),
}

ng_library = rule(
    implementation = _ng_library_impl,
    attrs = COMMON_ATTRIBUTES + NG_LIBRARY_ATTRIBUTES + {

        "tsconfig": attr.label(allow_files = True, single_file = True),

        # @// is special syntax for the "main" repository
        # The default assumes the user specified a target "node_modules" in their
        # root BUILD file.
        "node_modules": attr.label(
            default = Label("@//:node_modules")
        ),
    },
    outputs = COMMON_OUTPUTS,
)
