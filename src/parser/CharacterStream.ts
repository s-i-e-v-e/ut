/*
 * Copyright (c) 2020 Sieve
 *
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 */
import { TokenType } from "./mod.internal.ts";
import { Location } from "./mod.ts";
import { Errors } from "../util/mod.ts";

export default class CharacterStream {
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
            xs: [],
        };
    }

    back() {
        Errors.ASSERT(!!this.old);
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