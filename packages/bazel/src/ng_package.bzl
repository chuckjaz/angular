# Copyright Google Inc. All Rights Reserved.
#
# Use of this source code is governed by an MIT-style license that can be
# found in the LICENSE file at https://angular.io/license

def _ng_package_impl(ctx):
  return struct()
  
ng_package = rule(
    implementation = _ng_package_impl,
    attrs = {
      "srcs": attr.label_list(),
      "deps": attr.label_list(),
      "json": attr.label(allow_single_file = FileType([".json"])),
      "version": attr.string(),
    }
)
