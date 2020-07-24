/*
 * Copyright (c) 2020 Sieve
 *
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 */
import Logger from "./logger.ts";
import Errors from "./errors.ts";
import OS from "./os.ts";

export interface Dictionary<T> {
    [index: string]: T
}

export interface SourceFile {
    path: string;
    fsPath: string;
    contents: string;
}

export function clone<T>(x: T) {
    return Object.assign({}, x);
}

export function toHexString(xs: Uint8Array) {
    const ys = [];
    for (let i = 0; i < xs.length; i += 1) {
        const x = xs[i];
        const y = x.toString(16);
        ys.push(y.length === 2 ? y : `0${y}`);
    }
    return ys.join("");
}

export {
    Logger,
    Errors,
    OS,
};