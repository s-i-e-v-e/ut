/*
 * Copyright (c) 2020 Sieve
 *
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 */
import {
    CharacterStream,
    Location,
    Token,
    D, TypeSpecRef,
} from "../parser/mod.ts";
import {Registry} from "../parser/Block.ts";

function toTypeString(t: TypeSpecRef, xs?: Array<string>) {
    const g = Registry.resolveTypeSpec(t);
    const gID = Registry.resolveID(g.id);

    xs = xs ? xs : [""];
    xs.push(gID)
    if (g.typeSpecParams.length) {
        xs.push("[");
        for (let i = 0; i < g.typeSpecParams.length; i += 1) {
            toTypeString(g.typeSpecParams[i], xs);
        }
        xs.push("]");
    }
    return xs.join("");
}

export class Errors {
    static buildLocation(loc: Location) {
        const path = loc.path.replaceAll(/\\/g, "/");
        return `at file:///${path}:${loc.line}:${loc.character}`;
    }

    static buildErrorString(msg: string, loc: Location) {
        const x = Errors.buildLocation(loc);
        return `${msg}\t${x}`;
    }

    static Debug = class extends Error {
        constructor(msg: string) {
            super(msg);
        }
    }

    static UtError = class extends Error {
        constructor(msg: string) {
            super(msg);
        }
    }

    static EOF = class extends Errors.UtError {
        constructor(msg: string) {
            super(msg);
        }
    }

    static LexerError = class extends Errors.UtError {
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

    static ParserError = class extends Errors.UtError {
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

    static ArrayInit = class extends Errors.ParserError {
        constructor(msg: string) {
            super(msg);
        }
    }

    static IfExprMustReturn = class extends Errors.ParserError {
        constructor(msg: string) {
            super(msg);
        }
    }

    static SemanticError = class extends Errors.UtError {
        constructor(msg: string) {
            super(msg);
        }
    }

    static UnknownType = class extends Errors.SemanticError {
        constructor(msg: string) {
            super(msg);
        }
    }

    static DuplicateDef = class extends Errors.SemanticError {
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

    static VmError = class extends Errors.UtError {
        constructor(msg: string) {
            super(msg);
        }
    }

    static Lexer = class {
        static raiseInvalidNumber(cs: CharacterStream, loc: Location): never {
            const lexeme = cs.lexeme(loc, cs.loc());
            throw new Errors.InvalidNumber(Errors.buildErrorString(`Invalid number: ${lexeme}`, loc));
        }

        static raiseInvalidDecimalNumber(cs: CharacterStream, loc: Location): never {
            const lexeme = cs.lexeme(loc, cs.loc());
            throw new Errors.InvalidNumber(Errors.buildErrorString(`Decimal numbers cannot have leading zeros: ${lexeme}`, loc));
        }

        static raiseUnbalancedComment(cs: CharacterStream, loc: Location): never {
            const lexeme = cs.lexeme(loc, cs.loc());
            throw new Errors.UnbalancedComment(Errors.buildErrorString(`Unbalanced comment: ${lexeme}`, loc));
        }

        static raiseUnterminatedString(cs: CharacterStream, loc: Location): never {
            const lexeme = cs.lexeme(loc, cs.loc());
            throw new Errors.UnterminatedString(Errors.buildErrorString(`Unterminated string: ${lexeme}`, loc));
        }
    };

    static Parser = class {
        static parserError(msg: string, t: Token): never {
            throw new Errors.ParserError(Errors.buildErrorString(`${msg}: ${t.lexeme}`, t.loc));
        }

        static raiseExpectedButFound(exp: string, t: Token): never {
            throw new Errors.ExpectedButFound(Errors.buildErrorString(`Expected: ${exp}. Found: \`${t.lexeme}\``, t.loc));
        }

        static raiseArrayType(loc: Location): never {
            throw new Errors.ArrayType(Errors.buildErrorString(`Array must have exactly one type parameter.`, loc));
        }
    };


    static Checker = class {
        static raiseDuplicateDef(id: string, loc: Location): never {
            throw new Errors.ArrayInit(Errors.buildErrorString(`\`${id}\` already exists in current scope.`, loc));
        }
        static raiseArrayInitArgs(loc: Location): never {
            throw new Errors.ArrayInit(Errors.buildErrorString(`Array initialization failure: argument list is empty`, loc));
        }

        static raiseUnknownType(t: TypeSpecRef): never {
            const g = Registry.resolveTypeSpec(t);
            throw new Errors.UnknownType(Errors.buildErrorString(`Unknown type: ${toTypeString(t)}`, g.loc));
        }

        static raiseTypeMismatch(ltype: TypeSpecRef, rtype: TypeSpecRef, loc: Location): never {
            throw new Errors.TypeMismatch(Errors.buildErrorString(`Type mismatch: ${toTypeString(ltype)} != ${toTypeString(rtype)}`, loc));
        }

        static raiseMathTypeError(t: TypeSpecRef, loc: Location): never {
            throw new Errors.TypeMismatch(Errors.buildErrorString(`Math ops only defined on Integer, not ${toTypeString(t)}.`, loc));
        }

        static raiseArrayIndexError(t: TypeSpecRef, loc: Location): never {
            throw new Errors.TypeMismatch(Errors.buildErrorString(`Array index(es) must be Integer(s), not ${toTypeString(t)}.`, loc));
        }

        static raiseLogicalOperationError(t: TypeSpecRef, loc: Location): never {
            throw new Errors.TypeMismatch(Errors.buildErrorString(`Logic ops only defined on Bool, not ${toTypeString(t)}.`, loc));
        }

        static raiseIfConditionError(t: TypeSpecRef, loc: Location): never {
            throw new Errors.TypeMismatch(Errors.buildErrorString(`IF condition must evaluate to a Bool, not ${toTypeString(t)}.`, loc));
        }

        static raiseForConditionError(t: TypeSpecRef, loc: Location): never {
            throw new Errors.TypeMismatch(Errors.buildErrorString(`FOR condition must evaluate to a Bool, not ${toTypeString(t)}.`, loc));
        }

        static raiseTypeError(msg: string, loc: Location): never {
            throw new Errors.TypeMismatch(Errors.buildErrorString(msg, loc));
        }

        static raiseUnknownIdentifier(id: string, loc: Location): never {
            throw new Errors.UnknownIdentifier(Errors.buildErrorString(`Unknown identifier: ${id}`, loc));
        }

        static raiseUnknownFunction(id: string, loc: Location): never {
            throw new Errors.UnknownIdentifier(Errors.buildErrorString(`Unknown function: ${id}`, loc));
        }

        static raiseImmutableVar(v: D.VarSpec, loc: Location): never {
            throw new Errors.ImmutableVar(Errors.buildErrorString(`Cannot assign to immutable variable: ${v.id}`, loc));
        }

        static raiseFunctionParameterCountMismatch(id: string, loc: Location): never {
            throw new Errors.FunctionParameterCountMismatch(Errors.buildErrorString(`Function parameter and arg counts differ: ${id}`, loc));
        }

        static raiseIfExprMustReturn(loc: Location): never {
            throw new Errors.IfExprMustReturn(Errors.buildErrorString(`IF/ELSE expression must return a value.`, loc));
        }

        static unreachableCode(loc: Location): never {
            throw new Errors.TypeMismatch(Errors.buildErrorString(`Unreachable code after return.`, loc));
        }

        static error(msg: string, loc: Location): never {
            throw new Errors.UnknownType(Errors.buildErrorString(msg, loc));
        }
    };

    /*static raiseDebug(msgOrNode?: string|NodeType): never {
            const s = msgOrNode ? (typeof msgOrNode === "string" ? msgOrNode as string : NodeTypeEnum[msgOrNode as NodeType]) : "DebugError";
            throw new this.Debug(s);
    }

    static raiseVmError(msg: string) {
        throw new this.VmError(msg);
    }*/

    static eof(): never {
        throw new this.EOF("EOF");
    }

    static ASSERT(condition: boolean, msg?: string, loc?: Location): asserts condition {
        const m = msg ? (loc ? Errors.buildErrorString(msg || "", loc!) : msg) : "";
        if (!condition) throw new this.Debug(m);
    }

    static notImplemented(msg?: string): never {
        throw new Error(msg || "notImplemented");
    }

    static breakIf(cond: boolean) {
        Errors.debug(!cond);
    }

    static debug(cond?: boolean) {
        if (cond === undefined || !cond) {
            try {
                throw new Error();
            }
            catch (e) {
                // swallow
            }
        }
    }
}