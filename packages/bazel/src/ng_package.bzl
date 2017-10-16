# Copyright Google Inc. All Rights Reserved.
#
# Use of this source code is governed by an MIT-style license that can be
# found in the LICENSE file at https://angular.io/license

load(":ng_module.bzl", "AngularEntryPoint")

ESM_2016_EXT = '.closure.js'
ESM_2015_EXT = '.js'

def _collect_provider(ctx, provider):
  return [src[provider] for src in ctx.attr.srcs if provider in src]

def _package_version(ctx):
  if hasattr(ctx.attr, "version") and ctx.attr.version != "":
    return ctx.attr.version
  return "0.0.1"

# Produce the package.json file
def _package_json(ctx):
  package_json = ctx.file.json
  output = ctx.actions.declare_file(ctx.label.name + "_package.json")
  version = _package_version(ctx)
  ctx.actions.expand_template(
    template=package_json,
    output=output,
    substitutions={
      "0.0.0-PLACEHOLDER": version
    }
  )
  return output

# Calculate the destination name for a file copied to a directory
def _dest_name(ctx, path, file, dest_name=None, old_ext=None, new_ext=None):
  file_path = path + "/" + file.short_path[len(ctx.label.package) + 1:]
  if dest_name != None:
    file_path = file_path[:file_path.rfind("/") + 1] + dest_name
  if new_ext != None and old_ext != None:
    if file_path.endswith(old_ext):
      file_path = file_path[:-len(old_ext)] + new_ext
  return file_path

# Copy a file into a directory
def _copy_file(ctx, path, file, dest_name=None, old_ext=None, new_ext=None):
  file_path = _dest_name(ctx, path, file, dest_name, old_ext, new_ext)
  directory_name = file_path[:file_path.rfind("/")]
  return "mkdir -p " + directory_name + " 2> /dev/null; cp " + file.path + " " + file_path + "; "

# Copy all of the sources from files to sources_directory replacing the .es2016.js
# with .js.  Returns the directory the files are copied into.
def _copy_source_files(ctx, entry_point, files, ext):
  commands = ""
  inputs = []
  sources_directory = ctx.actions.declare_directory(ctx.label.name + "_sources" + ext)

  inputs += files.to_list() + [entry_point.index_js_file]
  for input in files:
    commands += _copy_file(ctx, sources_directory.path, input,
      old_ext = ext,
      new_ext = ".js")

  # Index is alwasy in es2016 target but can be used for 2015 as well.
  commands += _copy_file(ctx, sources_directory.path, entry_point.index_js_file,
    old_ext = ESM_2016_EXT,
    new_ext = ".js")

  ctx.actions.run_shell(
    progress_message="Angular Packaging: copying source files for %s" % ctx.label.name,
    mnemonic="AngularPackageSourceCopy",
    outputs=[sources_directory],
    inputs=inputs,
    command=commands)

  return sources_directory

# Flatten the sources using rollup.
# Returns the rolled-up file and the map file.
def _flatten_files(ctx, entry_point, source_files, base_name, ext, format, config = None):
  module = ctx.actions.declare_file(ctx.label.name + "_" + base_name + ext)
  module_map = ctx.actions.declare_file(ctx.label.name + "_" + base_name + ext + ".map")

  module_entry_point = _dest_name(ctx, source_files.path, entry_point.index_js_file,
    old_ext = ESM_2016_EXT,
    new_ext = ".js")
  args = [
    "--format", format,
    "--input", module_entry_point,
    "--output", module.path,
    "--sourcemap", module_map.path,
  ]

  if config != None:
    args += [
      "--config", config.path
    ]

  outputs = [module, module_map]
  ctx.action(
    progress_message = "Angular Packaging: rollup of sources for %s" % ctx.label.name,
    inputs = [source_files],
    outputs = outputs,
    executable = ctx.executable._rollup,
    arguments = args,
  )

  return struct(
    module = module,
    module_map = module_map,
  )

# Flatten the source files into a single flat ESM module
def _fesm_emit(ctx, entry_point, source_files, directory_path, module_id, base_name, ext):
  flat_files = _flatten_files(ctx, entry_point, source_files, base_name, ext, "es")
  commands = ""
  inputs = [flat_files.module, flat_files.module_map]

  flat_esm_path = directory_path
  slash_pos = module_id.rfind("/")
  if slash_pos >= 0:
    flat_esm_path += "/" + module_id[:slash_pos]
  commands += _copy_file(ctx, flat_esm_path,
    flat_files.module,
    dest_name =  base_name + ext,
  )
  commands += _copy_file(ctx, flat_esm_path,
    flat_files.module_map,
    dest_name =  base_name + ext + ".map",
  )

  return struct(
    commands = commands,
    inputs = inputs,
  )

# Flatten the source files into a single flat UMD module
def _fumd_emit(ctx, entry_point, source_files, directory_path, module_id, base_name, ext, config):
  flat_files = _flatten_files(ctx, entry_point, source_files, base_name, ext, "umd", config)
  commands = ""
  inputs = [flat_files.module, flat_files.module_map]

  commands += _copy_file(ctx, directory_path,
    flat_files.module,
    dest_name =  base_name + ext,
  )
  commands += _copy_file(ctx, directory_path,
    flat_files.module_map,
    dest_name =  base_name + ext + ".map",
  )

  return struct(
    commands = commands,
    inputs = inputs,
  )


def _flat_module_entry_point(ctx, directory, entry_point):
  # Calculate <base-name> and <directory>
  module_id = entry_point.module_id
  module_name = module_id
  if module_name.startswith("@"):
    slash_pos = module_name.find("/")
    if slash_pos > 0:
      module_name = module_name[slash_pos + 1:]
  slash_pos = module_name.rfind("/")
  base_name = module_name if slash_pos <= 0 else module_id[slash_pos + 1:]
  directory_path = directory.path
  if slash_pos >=0:
    slash_pos = module_name.find("/")
    directory_path += "/" + module_name[:slash_pos]

  commands = ""
  inputs = entry_point.dts_files.to_list()

  # Copy the .d.ts files
  for file in inputs:
    commands += _copy_file(ctx, directory_path, file)

  # Copy the flat index files
  inputs += [entry_point.index_dts_file, entry_point.index_metadata_file]
  commands += _copy_file(ctx, directory_path, entry_point.index_dts_file)
  commands += _copy_file(ctx, directory_path, entry_point.index_metadata_file)

  # Copy the source files
  es2015_source_files = _copy_source_files(ctx, entry_point, entry_point.esm_es2015_files, ESM_2015_EXT)
  es2016_source_files = _copy_source_files(ctx, entry_point, entry_point.esm_es2016_files, ESM_2016_EXT)

  # Produce the esm_2016 flat module and copy them to the package
  es2015_emit = _fesm_emit(ctx, entry_point, es2015_source_files, directory_path, module_id, base_name, ".es5.js")
  es2016_emit = _fesm_emit(ctx, entry_point, es2016_source_files, directory_path, module_id, base_name,  ".js")

  # Produce the umd bundle
  if entry_point.rollup_config != None:
    umd_emit = _fumd_emit(ctx, entry_point, es2015_source_files, directory.path + "/bundles", module_id, base_name, ".umd.js", entry_point.rollup_config)
  else:
    umd_emit = struct(commands = "", inputs = [])

  return struct(
    commands = commands + es2015_emit.commands + es2016_emit.commands + umd_emit.commands,
    inputs = inputs + es2015_emit.inputs + es2016_emit.inputs + umd_emit.inputs,
  )

# ng_package produces package that is npm ready.
def _ng_package_impl(ctx):
  directory = ctx.actions.declare_directory(ctx.label.name)
  commands = "mkdir " + directory.path + " 2> /dev/null; "
  inputs = []

  # Create and copy the package.json file
  package_json = _package_json(ctx)
  inputs += [package_json]
  commands += "cp " + package_json.path + " " + directory.path + "/package.json; "

  # Process each flat module
  for entry_point in _collect_provider(ctx, AngularEntryPoint):
    entry_point_result = _flat_module_entry_point(ctx, directory, entry_point)
    commands += entry_point_result.commands
    inputs += entry_point_result.inputs

  ctx.actions.run_shell(
    progress_message="Angular Packaging: building npm package for %s" % ctx.label.name,
    mnemonic="AngularPackage",
    outputs=[directory],
    inputs=inputs,
    command=commands)

  return struct(
    files = depset([directory])
  )


ng_package = rule(
    implementation = _ng_package_impl,
    attrs = {
      "srcs": attr.label_list(),
      "deps": attr.label_list(),
      "json": attr.label(allow_single_file = FileType([".json"])),
      "version": attr.string(),

      "_rollup": attr.label(default=Label("//src:rollup"), executable=True, cfg="host"),
    }
)
