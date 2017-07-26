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

load("@io_angular_rules_typescript//:defs.bzl", "nodejs_binary")

# Rule for running Rollup under Bazel

def _collect_es5_sources_impl(target, ctx):
  result = set()
  print("aspect visiting", target.label)
  if hasattr(ctx.rule.attr, "deps"):
    for dep in ctx.rule.attr.deps:
      if hasattr(dep, "es5_sources"):
        result += dep.es5_sources
  if hasattr(target, "typescript"):
    result += target.typescript.es5_sources
  return struct(es5_sources = result)

_collect_es5_sources = aspect(
    _collect_es5_sources_impl,
    attr_aspects = ["deps"],
)

def _flatten_module_impl(ctx):
  inputs = set()
  for s in ctx.attr.srcs:
    if hasattr(s, "es5_sources"):
      inputs += s.es5_sources

  args = ["--format", "es"]
  args += ["--input", ctx.attr.entry_point]
  args += ["--output", ctx.outputs.bundle.path]
  if ctx.attr.globals:
    args += ["--external", ",".join(ctx.attr.globals.keys())]
    args += ["--globals", ",".join([":".join([g[0], g[1]]) for g in ctx.attr.globals.items()])]
  #print("rollup inputs", inputs)
  ctx.action(
      progress_message = "Rollup bundling %s" % ctx.label,
      inputs = inputs.to_list(),
      outputs = [ctx.outputs.bundle],
      executable = ctx.executable._rollup,
      arguments = args,
  )
  return struct()

flatten_module = rule(
    implementation = _flatten_module_impl,
    attrs = {
        "srcs": attr.label_list(allow_files=True, aspects=[_collect_es5_sources]),
        "entry_point": attr.string(mandatory=True),
        "globals": attr.string_dict(),
        "_rollup": attr.label(default=Label("//internal:rollup"), executable=True, cfg="host"),
    },
    outputs = {
        "bundle": "%{name}.es6.js"
    })