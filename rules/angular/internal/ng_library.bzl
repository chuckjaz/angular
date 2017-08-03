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

load("@io_angular_rules_typescript//internal:build_defs.bzl", "tsc_wrapped_tsconfig")

load(
    "@io_angular_rules_typescript//internal:common/compilation.bzl",
    "COMMON_ATTRIBUTES", "compile_ts", "ts_providers_dict_to_struct"
)

load("@io_angular_rules_typescript//internal:common/json_marshal.bzl", "json_marshal")


ng_library = rule(
    implementation = _ng_module_impl,
    attrs = dict(COMMON_ATTRIBUTES, **{
        "srcs": attr.label_list(allow_files = True),

        # To be used only to bootstrap @angular/core compilation,
        # since we want to compile @angular/core with ngc, but ngc depends on
        # @angular/core typescript output.
        "write_ng_outputs_only": attr.bool(default = False),
        "tsconfig": attr.label(allow_files = True, single_file = True),
        "no_i18n": attr.bool(default = False),
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
