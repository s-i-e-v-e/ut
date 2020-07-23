/*
 * Copyright (c) 2020 Sieve
 *
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 */
import {
    Location,
    Type,
    Variable,
} from "../parser/mod.ts";
import {
    CharacterStream,
    Token,
} from "../parser/mod.internal.ts";

function buildErrorString(msg: string, loc: Location) {
    const path = loc.path.replaceAll(/\\/g, "/");
    return `${msg}\tat file:///${path}:${loc.line}:${loc.character}`;
}

export default class Errors {
    static Debug = class extends Error {
        constructor(msg: string) {
            super(msg);
        }
    }

    static EOF = class extends Error {
        constructor(msg: string) {
            super(msg);
        }
    }

    static LexerError = class extends Error {
        constructor(msg: string) {
            super(msg);
        }
    }

    static InvalidNumber = class extends Errors.LexerError {
        constructor(msg: string) {
            super(msg);
        }
    }

    static UnbalancedComment = class extends Errors.LexerError {
        constructor(msg: string) {
            super(msg);
        }
    }

    static UnterminatedString = class extends Errors.LexerError {
        constructor(msg: string) {
            super(msg);
        }
    }

    static ParserError = class extends Error {
        constructor(msg: string) {
            super(msg);
        }
    }

    static ExpectedButFound = class extends Errors.ParserError {
        constructor(msg: string) {
            super(msg);
        }
    }

    static ArrayType = class extends Errors.ParserError {
        constructor(msg: string) {
            super(msg);
        }
    }

    static SemanticError = class extends Error {
        constructor(msg: string) {
            super(msg);
        }
    }

    static UnknownType = class extends Errors.SemanticError {
        constructor(msg: string) {
            super(msg);
        }
    }

    static TypeMismatch = class extends Errors.SemanticError {
        constructor(msg: string) {
            super(msg);
        }
    }

    static UnknownIdentifier = class extends Errors.SemanticError {
        constructor(msg: string) {
            super(msg);
        }
    }

    static ImmutableVar = class extends Errors.SemanticError {
        constructor(msg: string) {
            super(msg);
        }
    }

    static FunctionParameterCountMismatch = class extends Errors.SemanticError {
        constructor(msg: string) {
            super(msg);
        }
    }

    static raiseInvalidNumber(cs: CharacterStream, loc: Location): never {
        const lexeme = cs.lexeme(loc, cs.loc());
        throw new this.InvalidNumber(buildErrorString(`Invalid number: ${lexeme}`, loc));
    }

    static raiseInvalidDecimalNumber(cs: CharacterStream, loc: Location): never {
        const lexeme = cs.lexeme(loc, cs.loc());
        throw new this.InvalidNumber(buildErrorString(`Decimal numbers cannot have leading zeros: ${lexeme}`, loc));
    }

    static raiseUnbalancedComment(cs: CharacterStream, loc: Location): never {
        const lexeme = cs.lexeme(loc, cs.loc());
        throw new this.UnbalancedComment(buildErrorString(`Unbalanced comment: ${lexeme}`, loc));
    }

    static raiseUnterminatedString(cs: CharacterStream, loc: Location): never {
        const lexeme = cs.lexeme(loc, cs.loc());
        throw new this.UnterminatedString(buildErrorString(`Unterminated string: ${lexeme}`, loc));
    }

    static raiseEOF(): never {
        throw new this.EOF("EOF");
    }

    static raiseDebug(msg?: string): never {
        throw new this.Debug(msg || "DebugError");
    }

    static raiseExpectedButFound(exp: string, t: Token): never {
        throw new this.ExpectedButFound(buildErrorString(`Expected: ${exp}. Found: \`${t.lexeme}\``, t.loc));
    }

    static raiseArrayType(t: Token): never {
        throw new this.ArrayType(buildErrorString(`Array must have exactly one type parameter: \`${t.lexeme}\``, t.loc));
    }

    static raiseUnknownType(t: Type, loc: Location): never {
        throw new this.UnknownType(buildErrorString(`Unknown type: ${t.id}`, loc));
    }

    static raiseTypeMismatch(ltype: Type, rtype: Type, loc: Location): never {
        throw new this.TypeMismatch(buildErrorString(`Type mismatch: ${ltype.id} != ${rtype.id}`, loc));
    }

    static raiseUnknownIdentifier(id: string, loc: Location): never {
        throw new this.UnknownIdentifier(buildErrorString(`Unknown identifier: ${id}`, loc));
    }

    static raiseImmutableVar(v: Variable) {
        throw new this.ImmutableVar(buildErrorString(`Cannot assign to immutable variable: ${v.id}`, v.loc));
    }

    static raiseFunctionParameterCountMismatch(id: string, loc: Location) {
        throw new this.ImmutableVar(buildErrorString(`Function parameter and arg counts differ: ${id}`, loc));
    }
}