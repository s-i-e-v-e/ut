/*
 * Copyright (c) 2020 Sieve
 *
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 */
import { parseFile } from "./parser/mod.ts";
import { check, rewrite } from "./semantics/mod.ts";
import {
    Logger,
    Errors,
    OS,
} from "./util/mod.ts";

export interface Config {
    logLevel: number,
    dump: boolean,
    base: string,
}

async function runFile(path: string, args: string[], c: Config) {
    const mods = await parseFile(c.base, path);
    const global = check(mods);
    //rewrite(global, mods);
}

export async function run(args: string[], c: Config) {
    try {
        const path = args.shift() || "";
        await runFile(path, args, c);
    }
    catch (e) {
        if (e instanceof Errors.UtError) {
            if (c.logLevel) {
                throw e;
            }
            else {
                Logger.error(e);
            }
        }
        else {
            throw e;
        }
    }
}