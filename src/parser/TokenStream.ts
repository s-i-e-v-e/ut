/*
 * Copyright (c) 2020 Sieve
 *
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 */
import {
    Token,
    Errors,
} from "./mod.ts";

export default class TokenStream {
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