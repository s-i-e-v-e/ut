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

let throwError = false;

export function enableThrowError(x: boolean) {
    throwError = x;
}

export function invalidNumber(lexeme: string) {
    const e = new InvalidNumber(`Invalid number: ${lexeme}`);
    if (throwError) throw e;
    Logger.error(e);
}

export function invalidDecimalNumber(lexeme: string) {
    const e = new InvalidNumber(`Decimal numbers cannot have leading zeros: ${lexeme}`);
    if (throwError) throw e;
    Logger.error(e);
}

export function invalidToken(lexeme: string) {
    const e = new InvalidToken(`Invalid token: ${lexeme}`);
    if (throwError) throw e;
    Logger.error(e);
}