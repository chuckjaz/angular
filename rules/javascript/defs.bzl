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

ClosureES2015Output = provider()
ESMES2015Output = provider()
ESMES2016Output = provider()
CommonJSES5Output = provider()

METADATA = {
  ClosureES2015Output: struct(
    extension = ".closure.js"
  ),
  ESMES2015Output: struct(
    extension = ".es5.js"
  ),
  ESMES2016Output: struct(
    extension = ".es2016.js"
  ),
  CommonJSES5Output: struct(
    extension = ".js"
  )
}