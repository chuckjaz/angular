# Copyright Google Inc. All Rights Reserved.
#
# Use of this source code is governed by an MIT-style license that can be
# found in the LICENSE file at https://angular.io/license

# ng_entry_point produces flat module entry point for a packages
# A package can be made up of several flat module entry points.

load(":rules_typescript.bzl",
    "tsc_wrapped_tsconfig",
    "compile_ts",
    "json_marshal",
)

load(":ng_module.bzl", "ngc_compile_action")
load(":ng_library.bzl", "ModuleId")

AngularEntryPoint = provider()

def _collect_files(ctx, bundle, files_attr):
  files = depset()
  for src in ctx.attr.srcs:
    if hasattr(src, bundle):
      typescript = getattr(src, bundle)
      if hasattr(typescript, files_attr):
          files += getattr(typescript, files_attr)
  return files
  
def _determine_module_id(ctx):
  """Determine the module id from the sources module_name attributes"""
  definition_src = None
  module_id = None
  for src in ctx.attr.srcs:
    if ModuleId in src:
      src_module_id = src[ModuleId].id
      if module_id == None:
        module_id = src_module_id
        definition_src = src
      elif module_id != src_module_id:
        fail( ("Two or more different specified by sources %s (from %s) and %s (from %s)" % 
          (module_id, definition_src.label, src_module_id, src.label)), "srcs")
  if module_id == None:
    fail("Expected at least one of the srcs to provide a module id", "srcs")
  return module_id

def _ngc_tsconfig(ctx, files, srcs, output, apis, index_name, module_id, **kwargs):
  config = tsc_wrapped_tsconfig(ctx, files, srcs, **kwargs)
  config["bazelOptions"]["tsickleGenerateExterns"] = False
  return dict(config, **{
      "angularCompilerOptions": {
          "skipMetadataEmit": False,
          "skipTemplateCodegen": True,
          "angularFilesOnly": True,
          "flatModuleOutFile": index_name,
          "flatModuleId": module_id,
          "flatModuleIndex": [apis],
          "expectedOut": [o.path for o in output]
      }
  })

def _ng_entry_point_impl(ctx):
  dts_files = _collect_files(ctx, "typescript", "transitive_declarations")
  metadata_files = _collect_files(ctx, "angular", "metadata")
  esm_es2016_files = _collect_files(ctx, "typescript", "es6_sources")
  esm_es2015_files = _collect_files(ctx, "typescript", "es5_sources")
  index = ctx.file.index
  apis = ctx.file.apis
  index_name = index.basename[:index.basename.rfind(".")]
  apis_name = apis.path[:apis.path.rfind(".")]
  module_id = _determine_module_id(ctx)

  # allocate a json file name
  tsconfig_json = ctx.new_file(ctx.label.name + "_angular_metadata_tsconfig.json")

  # Produces an <index-name>.<suffix>.js file as a <index-name>.metadata.json
  index_js_file = ctx.new_file(ctx.bin_dir, index_name + ".closure.js")
  index_dts_file = ctx.new_file(ctx.bin_dir, index_name + ".d.ts")
  index_metadata_file = ctx.new_file(ctx.bin_dir, index_name + ".metadata.json")
  input = dts_files.to_list() + metadata_files.to_list() + [index] + ctx.files.srcs + [tsconfig_json]
  output = [index_js_file, index_dts_file, index_metadata_file]

  # Produce the tsconfig.json file
  tsconfig = _ngc_tsconfig(ctx, dts_files.to_list(), dts_files, output, apis_name, index_name,
    module_id = module_id)
  ctx.file_action(output=tsconfig_json, content=json_marshal(tsconfig))
  
  # Invoke the ngc compiler to produce the result
  ngc_compile_action(ctx, ctx.label, input, output, None, tsconfig_json.path)

  # Determine the rollup config, if present.
  rollup_config = None
  if hasattr(ctx, "rollup_config"):
    rollup_config = ctx.file.rollup_config

  return struct(
    files = depset([index_dts_file]),
    providers = [
      AngularEntryPoint(
        module_id = module_id,
        index_js_file = index_js_file,
        index_dts_file = index_dts_file,
        index_metadata_file = index_metadata_file,
        esm_es2016_files = esm_es2016_files,
        esm_es2015_files = esm_es2015_files,
        dts_files = dts_files,
        rollup_config = rollup_config,
      )
    ]
  )

ENTRY_POINT_ATTRIBUTES = {
    "srcs": attr.label_list(),
    "index": attr.label(allow_single_file = FileType([".ts"])),
    "apis": attr.label(allow_single_file = FileType([".ts"])),
    "rollup_config": attr.label(allow_single_file = FileType([".js"])),

    "compiler": attr.label(
        default = Label("//src/ngc-wrapped"),
        executable = True,
        cfg = "host",
    ),

    "no_i18n": attr.bool(default = True),
    
    "tsconfig": attr.label(allow_files = True, single_file=True),

    "_supports_workers": attr.bool(default = True),
}

ng_entry_point = rule(
    implementation = _ng_entry_point_impl,
    attrs = ENTRY_POINT_ATTRIBUTES + {
      "node_modules": attr.label(default = Label("@//:node_modules")),
      
      # TODO(chuckj): Remove if the corresponding attr is removed from ts_library
      "runtime": attr.string(default="browser"),
    }
)
