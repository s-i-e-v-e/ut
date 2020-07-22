/*
 * Copyright (c) 2020 Sieve
 *
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 */
import Ut from "./util/mod.ts";
const Errors = Ut.errors;

export interface Dictionary<T> {
    [index: string]: T
}

export interface SourceFile {
    path: string;
    fsPath: string;
    contents: string;
}

export interface Location {
    line: number;
    character: number;
    index: number;
    path: string;
}

export enum TokenType {
    TK_WHITESPACE = 128,
    TK_COMMENT,
    TK_ID,
    TK_TYPE,
    TK_STRING_LITERAL,
    TK_BINARY_NUMBER_LITERAL,
    TK_OCTAL_NUMBER_LITERAL,
    TK_DECIMAL_NUMBER_LITERAL,
    TK_HEXADECIMAL_NUMBER_LITERAL,
}

export interface Token {
    type: TokenType,
    loc: Location,
    lexeme: string,
}

export class CharacterStream {
    private old?: Location;
    private index: number;
    private line: number;
    private character: number;

    private constructor(private readonly data: string, private readonly path: string) {
        this.index = 0;
        this.line = 1;
        this.character = 1;
    }

    eof() {
        return this.index >= this.data.length;
    }

    peek() {
        return this.data.charAt(this.index);
    }

    next() {
        if (this.eof()) Errors.raiseEOF();
        this.old = this.loc();
        let c = this.peek();
        this.index += 1;
        if (c === '\n') {
            this.line += 1;
            this.character = 1;
        }
        else {
            this.character += 1;
        }
        return c;
    }

    lexeme(start: Location, end: Location) {
        return this.data.substring(start.index, end.index);
    }

    token(type: TokenType, start: Location) {
        const end = this.loc();
        return {
            lexeme: this.lexeme(start, end),
            type: type,
            loc: start,
        };
    }

    back() {
        if (!this.old) return Errors.raiseDebug();
        this.index = this.old.index;
        this.character = this.old.character;
        this.line = this.old.line;
        this.old = undefined;
        return this.peek();
    }

    loc() : Location {
        return {
            line: this.line,
            character: this.character,
            index: this.index,
            path: this.path,
        };
    }

    static build(data: string, path: string) {
        return new CharacterStream(data, path);
    }
}

export class TokenStream {
    private index: number;
    public readonly length: number;

    constructor(private readonly xs: Array<Token>) {
        this.index = 0;
        this.length = xs.length;
    }

    eof() {
        return this.index >= this.xs.length;
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

    print() {
        console.log(this.xs);
    }

    static build(xs: Array<Token>) {
        return new TokenStream(xs);
    }
}