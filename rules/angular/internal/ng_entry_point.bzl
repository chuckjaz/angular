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

load("@io_angular_rules_javascript//:defs.bzl", "ESMES2016Output", "ESMES2015Output")
load("@io_angular_rules_typescript//:defs.bzl", "TypeScriptTransitiveDeclarations")
load("@io_angular_rules_typescript//internal:build_defs.bzl", "tsc_wrapped_tsconfig",
  "default_compile_action")

load(
    "@io_angular_rules_typescript//internal:common/compilation.bzl",
    "COMMON_ATTRIBUTES", "compile_ts", "ts_providers_dict_to_struct",
    "collect_transitive_dts"
)

load("@io_angular_rules_typescript//internal:common/json_marshal.bzl", "json_marshal")

load(":ng_library.bzl", "AngularMetadata", "ModuleId")

AngularEntryPoint = provider()

def _collect_files(ctx, provider):
  files = depset()
  for src in ctx.attr.srcs:
    if provider in src:
      files += src[provider].files
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

def _ngc_tsconfig(ctx, files, srcs, apis, index_name, module_id, **kwargs):
  config = tsc_wrapped_tsconfig(ctx, files, srcs, AngularEntryPoint, **kwargs)
  return dict(config, **{
      "angularCompilerOptions": {
          "skipMetadataEmit": False,
          "skipTemplateCodegen": True,
          "angularFilesOnly": True,
          "flatModuleOutFile": index_name,
          "flatModuleId": module_id,
      }
  })

def _ng_entry_point_impl(ctx):
  dts_files = _collect_files(ctx, TypeScriptTransitiveDeclarations)
  metadata_files = _collect_files(ctx, AngularMetadata)
  esm_es2016_files = _collect_files(ctx, ESMES2016Output)
  esm_es2015_files = _collect_files(ctx, ESMES2015Output)
  index = ctx.file.index
  apis = ctx.file.apis
  index_name = index.basename[:index.basename.rfind(".")]
  module_id = _determine_module_id(ctx)

  # Produce the tsconfig.json file
  tsconfig_json = ctx.new_file(ctx.label.name + "_angular_metadata_tsconfig.json")
  tsconfig = _ngc_tsconfig(ctx, [apis] + dts_files.to_list(), dts_files, apis, index_name,
    module_id = module_id,
    target = "ES2016",
    module = "es2015",
    suffix = "es2016"
  )
  ctx.file_action(output=tsconfig_json, content=json_marshal(tsconfig))
  
  # Produces an <index-name>.<suffix>.js file as a <index-name>.metadata.json
  index_js_file = ctx.new_file(ctx.bin_dir, index_name + ".es2016.js")
  index_dts_file = ctx.new_file(ctx.bin_dir, index_name + ".d.ts")
  index_metadata_file = ctx.new_file(ctx.bin_dir, index_name + ".metadata.json")
  input = dts_files.to_list() + metadata_files.to_list() + [index] + ctx.files.srcs + [tsconfig_json]
  output = depset([index_js_file, index_dts_file, index_metadata_file])

  # Invoke the ngc compiler to produce the result
  default_compile_action(ctx, input, output, tsconfig_json.path, 
     AngularEntryPoint,
    "AngularFlatModule", 
    "Producing Angular Flat Module Index for %s" % ctx.label)

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

# ng_entry_point produces flat module entry point for a packages
# A package can be made up of several flat module entry points.
ng_entry_point = rule(
    implementation = _ng_entry_point_impl,
    attrs = {
      "srcs": attr.label_list(),
      "index": attr.label(allow_single_file = FileType([".ts"])),
      "apis": attr.label(allow_single_file = FileType([".ts"])),
      "rollup_config": attr.label(allow_single_file = FileType([".js"])),

      # Duplicated from the ng_module rule
      "compiler": attr.label(
        default = Label("//internal/ngc"),
        executable = True,
        cfg = "host",
      ),
      "supports_workers": attr.bool(default = False),
      
      # Duplicated from the ts_library rule
      "tsconfig": attr.label(allow_files = True, single_file=True),
      "node_modules": attr.label(default = Label("@//:node_modules")),
      # TODO(chuckj): Remove if the corresponding attr is removed from ts_library
      "runtime": attr.string(default="browser"),
    }
)
