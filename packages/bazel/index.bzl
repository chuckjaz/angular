# Copyright Google Inc. All Rights Reserved.
#
# Use of this source code is governed by an MIT-style license that can be
# found in the LICENSE file at https://angular.io/license
""" Public API surface is re-exported here.
Users should not load files under "/src"
"""

load("//src:ng_module.bzl", "ng_module")
load("//src:ng_library.bzl", "ng_library", "ModuleId")
load("//src:ng_entry_point.bzl", "ng_entry_point")