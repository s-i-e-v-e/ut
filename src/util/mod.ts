/*
 * Copyright (c) 2020 Sieve
 *
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 */
import {
    Logger,
} from "./logger.ts";
import Errors from "./errors.ts";
import { OS } from "./os.ts";

export interface Dictionary<T> {
    [index: string]: T;
    [index: number]: T;
}

export interface SourceFile {
    path: string;
    fsPath: string;
    contents: string;
}

export interface Config {
    logLevel: number,
    dump: boolean,
    base: string,
}

export interface Command {
    id: string,
    args: string[],
}

export function clone<T>(x: T|Array<T>): T|Array<T> {
    if (Array.isArray(x)) {
        const xs:T[] = x;
        const ys:T[] = [];
        for (const v of xs) {
            const y: T = clone(v) as T;
            ys.push(y);
        }
        return ys;
    }
    else if (typeof x === "object") {
        const y = Object();
        for (const [k, v] of object_entries(x)) {
            if (k === "body") continue;
            if (k === "tag") continue;
            y[k] = clone(v);
        }
        return y;
    }
    else {
        return x;
    }
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

export function object_values(x: any) {
    return Object.values(x);
}

export function object_entries<T>(x: T) {
    return Object.entries(x);
}

export function object_keys<T>(x: T) {
    return Object.keys(x);
}

export function Int(n: number|bigint|string) {
    return BigInt(n);
}

export type int = bigint;

export {
    Logger,
    Errors,
    OS,
};