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
    Parameter,
    Dictionary,
} from "./mod.ts";



function parseID(ts: TokenStream) {
    return ts.nextMustBe(TokenType.TK_ID).lexeme;
}

function parseType(ts: TokenStream) {
    return ts.nextMustBe(TokenType.TK_TYPE).lexeme;
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

function parseRValue(ts: TokenStream) {
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

function parseVarDef(ts: TokenStream, isMutable: boolean) {
    const id = parseID(ts);
    const type = parseInferredType(ts);
    ts.nextMustBe("=");
    const expr = parseRValue(ts);
    return {
        id: id,
        type: type,
        isMutable: isMutable,
        expr: expr,
    }
}

function parseBody(ts: TokenStream) {
    const xs = new Array<Stmt>();
    while (!ts.nextIs("}")) {
        if (ts.consumeIfNextIs("let")) {
            xs.push(parseVarDef(ts, false));
        }
        else if (ts.consumeIfNextIs("mut")) {
            xs.push(parseVarDef(ts, true));
        }
        else {
            Errors.raiseDebug();
        }
        ts.nextMustBe(";");
    }
    return xs;
}

function parseParameters(ts: TokenStream) {
    const xs = new Array<Parameter>();
    while (ts.peek().lexeme !== ")") {
        const id = parseID(ts);
        ts.nextMustBe(":");
        const type = parseType(ts);
        if (ts.peek().lexeme === ")") continue;
        ts.nextMustBe(",");
        xs.push({
            id: id,
            type: type
        });
    }
    return xs;
}

function parseInferredType(ts: TokenStream) {
    let ty = undefined;
    if (ts.consumeIfNextIs(":")) {
        ty = parseType(ts);
    }
    return ty;
}

function parseFunction(ts: TokenStream) {
    ts.nextMustBe("fn");
    const id = parseID(ts);
    ts.nextMustBe("(");
    const xs = parseParameters(ts);
    ts.nextMustBe(")");
    const returnType = parseInferredType(ts);
    ts.nextMustBe("{");
    const body = parseBody(ts);
    ts.nextMustBe("}");

    return {
        id: id,
        params: xs,
        returnType: returnType,
        body: body,
    }
}

export default function parse(f: SourceFile) {
    Logger.info(`Parsing: ${f.path}`);
    const cs = CharacterStream.build(f.contents, f.fsPath);
    const ts = lex(cs);
    const fn = parseFunction(ts);
    console.log(fn);
}