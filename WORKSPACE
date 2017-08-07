local_repository(
    name = "io_angular_rules_javascript",
    path = "rules/javascript",
)

local_repository(
    name = "io_angular_rules_typescript",
    path = "rules/typescript",
)

load("@io_angular_rules_typescript//:defs.bzl", "node_repositories")

node_repositories(package_json = "//:package.json")

local_repository(
    name = "io_angular_rules_angular",
    path = "rules/angular",
)