# IDEAS

## Naming

- Consider using `-` as an id separator: `read-file`. Compiler can flag ambiguities such as variables `read` and `file` existing in the current scope which could result in `read-file` being treated as a subtraction op.