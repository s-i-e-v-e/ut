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
} from "./mod.ts";

function skipWhiteSpace(ts: TokenStream) {
    while (true) {
        const ty = ts.peek().type;
        if (ty === TokenType.TK_WHITESPACE || ty === TokenType.TK_COMMENT) {
            ts.next();
        }
        else {
            break;
        }
    }
}

function nextIs(x: string, ts: TokenStream) {
    let n = 0;
    while (true) {
        const t = ts.peek(n);
        const ty = t.type;
        if (ty === TokenType.TK_WHITESPACE || ty === TokenType.TK_COMMENT) {
            n += 1;
        }
        else {
            return t.lexeme === x;
        }
    }
}

function consume(ts: TokenStream) {
    skipWhiteSpace(ts);
    ts.next();
}

function nextMustBe(x: string | TokenType, ts: TokenStream) {
    let t;
    if (typeof x === "string") {
        skipWhiteSpace(ts);
        t = ts.next();
        if (t.lexeme !== x as string) {
            Errors.raiseExpectedButFound(`\`${x}\``, t);
        }
    }
    else {
        const y = x as TokenType;
        if (y !== TokenType.TK_WHITESPACE) skipWhiteSpace(ts);
        t = ts.next();
        if (t.type !== y) {
            let exp;
            switch (y) {
                case TokenType.TK_WHITESPACE: exp = "Whitespace"; break;
                case TokenType.TK_ID: exp = "Identifier"; break;
                case TokenType.TK_TYPE: exp = "Type"; break;
                default: return Errors.raiseDebug();
            }
            Errors.raiseExpectedButFound(exp, t);
        }
    }
    return t;
}

function parseID(ts: TokenStream) {
    return nextMustBe(TokenType.TK_ID, ts).lexeme;
}

function parseType(ts: TokenStream) {
    return nextMustBe(TokenType.TK_TYPE, ts).lexeme;
}

function parseVarDef(ts: TokenStream, isMutable: boolean) {
    const id = parseID(ts);
    const type = parseInferredType(ts);
    nextMustBe("=", ts);
    nextMustBe("undefined", ts);
    return {
        id: id,
        type: type,
        isMutable: isMutable,
        expr: {},
    }
}

function parseBody(ts: TokenStream) {
    const xs = new Array<Stmt>();
    while (!nextIs("}", ts)) {
        if (nextIs("let", ts)) {
            consume(ts);
            xs.push(parseVarDef(ts, false));
        }
        else if (nextIs("mut", ts)) {
            consume(ts);
            xs.push(parseVarDef(ts, true));
        }
        else {
            Errors.raiseDebug();
        }
        nextMustBe(";", ts);
    }
    return xs;
}

function parseParameters(ts: TokenStream) {
    const xs = new Array<Parameter>();
    while (ts.peek().lexeme !== ")") {
        const id = parseID(ts);
        nextMustBe(":", ts);
        const type = parseType(ts);
        if (ts.peek().lexeme === ")") continue;
        nextMustBe(",", ts);
        xs.push({
            id: id,
            type: type
        });
    }
    return xs;
}

function parseInferredType(ts: TokenStream) {
    let ty = undefined;
    if (nextIs(":", ts)) {
        consume(ts);
        ty = parseType(ts);
    }
    return ty;
}

function parseFunction(ts: TokenStream) {
    nextMustBe("fn", ts);
    nextMustBe(TokenType.TK_WHITESPACE, ts);
    const id = parseID(ts);
    nextMustBe("(", ts);
    const xs = parseParameters(ts);
    nextMustBe(")", ts);
    const returnType = parseInferredType(ts);
    nextMustBe("{", ts);
    const body = parseBody(ts);
    nextMustBe("}", ts);

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