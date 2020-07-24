/*
 * Copyright (c) 2020 Sieve
 *
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 */
import {
    Token,
    TokenType,
} from "./mod.internal.ts";
import { Errors } from "../util/mod.ts";

export default class TokenStream {
    private index: number;
    public readonly length: number;

    constructor(private readonly xs: Array<Token>) {
        this.index = 0;
        this.length = xs.length;
    }

    getIndex() {
        return this.index;
    }

    getAsToken(start: number, end: number) {
        let xs = []

        for (let i = start; i < end; i += 1) {
            const x = this.xs[i];
            xs.push(x.lexeme);
        }

        return {
            type: TokenType.TK_INTERNAL,
            loc: this.xs[start].loc,
            lexeme: xs.join(""),
        };
    }

    eof() {
        return this.index >= this.xs.length;
    }

    loc() {
        return this.peek().loc;
    }

    peek(n?: number) {
        return this.xs[n ? this.index + n : this.index];
    }

    next() {
        if (this.eof()) Errors.raiseEOF();
        let x = this.peek();
        this.index += 1;
        return x;
    }

    nextIs(x: string) {
        return this.peek().lexeme === x;
    }

    nextIsLiteral() {
        switch (this.peek().type) {
            case TokenType.TK_STRING_LITERAL:
            case TokenType.TK_BOOLEAN_LITERAL:
            case TokenType.TK_DECIMAL_NUMBER_LITERAL:
            case TokenType.TK_HEXADECIMAL_NUMBER_LITERAL:
            case TokenType.TK_OCTAL_NUMBER_LITERAL:
            case TokenType.TK_BINARY_NUMBER_LITERAL: {
                return true;
            }
            default: {
                return false;
            }
        }
    }

    consumeIfNextIs(x: string) {
        if (this.nextIs(x)) {
            return this.next();
        }
        else {
            return undefined;
        }
    }

    nextMustBe(x: string | TokenType): Token {
        let t;
        if (typeof x === "string") {
            t = this.next();
            if (t.lexeme !== x as string) {
                Errors.raiseExpectedButFound(`\`${x}\``, t);
            }
        }
        else {
            const y = x as TokenType;
            t = this.next();
            if (t.type !== y) {
                let exp;
                switch (y) {
                    case TokenType.TK_ID: exp = "Identifier"; break;
                    case TokenType.TK_TYPE: exp = "Type"; break;
                    default: return Errors.raiseDebug(JSON.stringify(t));
                }
                Errors.raiseExpectedButFound(exp, t);
            }
        }
        return t;
    }

    static build(xs: Array<Token>) {
        return new TokenStream(xs.filter(t => t.type !== TokenType.TK_WHITESPACE && t.type !== TokenType.TK_COMMENT));
    }
}