/*
 * Copyright (c) 2020 Sieve
 *
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 */
import * as Logger from "./logger.ts";

export class InvalidNumber extends Error {
    constructor(msg: string) {
        super(msg);
    }
}

export class InvalidToken extends Error {
    constructor(msg: string) {
        super(msg);
    }
}

export class EOF extends Error {
    constructor(msg: string) {
        super(msg);
    }
}

export class UnbalancedComment extends Error {
    constructor(msg: string) {
        super(msg);
    }
}

export class UnterminatedString extends Error {
    constructor(msg: string) {
        super(msg);
    }
}

export class Debug extends Error {
    constructor(msg: string) {
        super(msg);
    }
}

let throwError = false;

export function enableThrowError(x: boolean) {
    throwError = x;
}

export function raiseInvalidNumber(lexeme: string) {
    const e = new InvalidNumber(`Invalid number: ${lexeme}`);
    if (throwError) throw e;
    return Logger.error(e);
}

export function raiseInvalidDecimalNumber(lexeme: string) {
    const e = new InvalidNumber(`Decimal numbers cannot have leading zeros: ${lexeme}`);
    if (throwError) throw e;
    return Logger.error(e);
}

export function raiseInvalidToken(lexeme: string) {
    const e = new InvalidToken(`Invalid token: ${lexeme}`);
    if (throwError) throw e;
    return Logger.error(e);
}

export function raiseUnbalancedComment(lexeme: string): never {
    const e = new UnbalancedComment(`Unbalanced comment: ${lexeme}`);
    if (throwError) throw e;
    return Logger.error(e);
}

export function raiseUnterminatedString(lexeme: string): never {
    const e = new UnterminatedString(`Unterminated string: ${lexeme}`);
    if (throwError) throw e;
    return Logger.error(e);
}

export function raiseEOF() {
    throw new EOF("EOF");
}

export function raiseDebug(msg?: string): never {
    throw new Debug(msg || "DebugError");
}

