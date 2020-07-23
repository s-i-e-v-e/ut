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

export {
    Logger,
    Errors,
    OS,
};