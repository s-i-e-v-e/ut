/*
 * Copyright (c) 2020 Sieve
 *
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 */
import {
    CharacterStream,
    TokenType,
    TokenStream,
    Errors,
    Logger,
    SourceFile,
    lex,
    Stmt,
    Dictionary,
    Type,
    NotInferred,
    Function,
    Struct,
    Variable,
    Parameter,
    Expr, VarInitStmt,
} from "./mod.ts";

function parseID(ts: TokenStream) {
    return ts.nextMustBe(TokenType.TK_ID).lexeme;
}

function parseTypeParameters(ts: TokenStream) {
    const xs = new Array<Type>();
    while (!ts.nextIs("]")) {
        xs.push(parseType(ts));
        if (!ts.consumeIfNextIs(",")) break;
    }
    return xs;
}

function parseType(ts: TokenStream) {
    const idx = ts.getIndex();
    if (ts.consumeIfNextIs("[")) {
        const x = {
            id: "Array",
            typeParameters: parseTypeParameters(ts),
        };
        ts.nextMustBe("]");
        const tx = ts.getAsToken(idx, ts.getIndex());
        if (x.typeParameters.length != 1) {
            Errors.raiseArrayType(tx);
        }
        return x;
    }
    else {
        const id = ts.nextMustBe(TokenType.TK_TYPE).lexeme;
        if (ts.consumeIfNextIs("[")) {
            const x = {
                id: id,
                typeParameters: parseTypeParameters(ts),
            };
            ts.nextMustBe("]");
            return x;
        }
        else {
            return {
                id: id,
            };
        }
    }
}

const NumGrid: Dictionary<number> = {
    "0" : 0,
    "1" : 1,
    "2" : 2,
    "3" : 3,
    "4" : 4,
    "5" : 5,
    "6" : 6,
    "7" : 7,
    "8" : 8,
    "9" : 9,
    "A" : 10,
    "B" : 11,
    "C" : 12,
    "D" : 13,
    "E" : 14,
    "F" : 15,
    "a" : 10,
    "b" : 11,
    "c" : 12,
    "d" : 13,
    "e" : 14,
    "f" : 15,
}

function parseNumber(n: string, radix: number) {
    n = radix === 10 ? n : n.substring(2);
    const isKilo = n.endsWith("K");
    n = isKilo ? n.substring(0, n.length - 1) : n;

    let sum = BigInt(0);
    for (let i = 0; i < n.length; i += 1) {
        const d = n.charAt(n.length - i - 1);
        sum += BigInt(NumGrid[d] * (radix ** i));
    }
    sum = isKilo ? sum * BigInt(1024) : sum;
    return sum;
}

function parseLiteral(ts: TokenStream) {
    const t = ts.next();
    switch (t.type) {
        case TokenType.TK_STRING_LITERAL: return t.lexeme.substring(1, t.lexeme.length - 1);
        case TokenType.TK_BOOLEAN_LITERAL: return t.lexeme === "true";
        case TokenType.TK_BINARY_NUMBER_LITERAL: return parseNumber(t.lexeme, 2);
        case TokenType.TK_OCTAL_NUMBER_LITERAL: return parseNumber(t.lexeme, 8);
        case TokenType.TK_HEXADECIMAL_NUMBER_LITERAL: return parseNumber(t.lexeme, 16);
        case TokenType.TK_DECIMAL_NUMBER_LITERAL: return parseNumber(t.lexeme, 10);
        default: return Errors.raiseDebug();
    }
}

function parseFunctionApplication(ts: TokenStream, id: string) {
    const xs = new Array<Expr>();
    ts.nextMustBe("(");
    while (!ts.nextIs(")")) {
        xs.push(parseExpr(ts));
        if (!ts.consumeIfNextIs(",")) break;
    }
    ts.nextMustBe(")");
    return {
        id: id,
        args: xs,
    };
}

function parseExpr(ts: TokenStream) {
    if (ts.nextIsLiteral()) return parseLiteral(ts);
    const id = parseID(ts);
    if (ts.nextIs("(")) {
        return parseFunctionApplication(ts, id);
    }
    else {
        return {
            id: id,
        }
    }
}

function parseVarDef(ts: TokenStream, isMutable: boolean, typeCanBeInferred: boolean): Variable {
    const id = parseID(ts);
    const type = typeCanBeInferred ? NotInferred : parseInferredType(ts, true);
    return {
        id: id,
        type: type,
        isMutable: isMutable,
    }
}

function parseVarInit(ts: TokenStream, isMutable: boolean): VarInitStmt {
    const v = parseVarDef(ts, isMutable, true);
    ts.nextMustBe("=");
    const expr = parseExpr(ts);
    return {
        var: v,
        expr: expr,
    }
}

function parseBody(ts: TokenStream) {
    const xs = new Array<Stmt>();
    while (!ts.nextIs("}")) {
        if (ts.consumeIfNextIs("let")) {
            xs.push(parseVarInit(ts, false));
        }
        else if (ts.consumeIfNextIs("mut")) {
            xs.push(parseVarInit(ts, true));
        }
        else {
            const id = parseID(ts);
            if (ts.consumeIfNextIs("=")) {
                xs.push({
                    id: id,
                    expr: parseExpr(ts),
                });
            }
            else {
                xs.push({
                    fa: parseFunctionApplication(ts, id),
                });
            }
        }
        ts.nextMustBe(";");
    }
    return xs;
}

function parseVariableList(ts: TokenStream, isMutable: boolean, typeCanBeInferred: boolean) {
    const xs = new Array<Parameter>();
    while (ts.peek().lexeme !== ")") {
        xs.push(parseVarDef(ts, isMutable, typeCanBeInferred));
        if (ts.peek().lexeme === ")") continue;
        ts.nextMustBe(",");
    }
    return xs;
}

function parseParameterList(ts: TokenStream) {
    return parseVariableList(ts, false, false);
}

function parseStructMemberList(ts: TokenStream) {
    return parseVariableList(ts, false, false);
}

function parseInferredType(ts: TokenStream, force: boolean) {
    if (force) {
        ts.nextMustBe(":");
        return parseType(ts);
    }
    else {
        if (ts.consumeIfNextIs(":")) {
            return parseType(ts);
        }
        else {
            return NotInferred;
        }
    }
}

function parseFunction(ts: TokenStream) {
    ts.nextMustBe("fn");
    const id = parseID(ts);
    ts.nextMustBe("(");
    const xs = parseParameterList(ts);
    ts.nextMustBe(")");
    const returnType = parseInferredType(ts, false);
    ts.nextMustBe("{");
    const body = parseBody(ts);
    ts.nextMustBe("}");

    return {
        id: id,
        params: xs,
        returnType: returnType,
        body: body,
    };
}

function parseStruct(ts: TokenStream) {
    ts.nextMustBe("struct");
    const ty = parseType(ts);
    ts.nextMustBe("(");
    const members = parseStructMemberList(ts);
    ts.nextMustBe(")");
    return {
        type: ty,
        members: members,
    }
}

function parseModule(ts: TokenStream) {
    const xs = new Array<Function>();
    const ys = new Array<Struct>();
    while (!ts.eof()) {
        if (ts.nextIs("fn")) {
            xs.push(parseFunction(ts));
        }
        else if (ts.nextIs("struct")) {
            ys.push(parseStruct(ts));
        }
        else {
            Errors.raiseDebug();
        }
    }

    return {
        functions: xs,
        structs: ys,
    };
}

export default function parse(f: SourceFile) {
    Logger.info(`Parsing: ${f.path}`);
    const cs = CharacterStream.build(f.contents, f.fsPath);
    const ts = lex(cs);
    const m = parseModule(ts);

    m.functions.forEach(x => console.log(x));
    m.structs.forEach(x => console.log(x));

}