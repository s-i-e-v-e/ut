/*
 * Copyright (c) 2020 Sieve
 *
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 */
import parse from "./parser/parser.ts";
import {
    infer,
    check,
    transform,
} from "./semantics/mod.ts";
import {
    Logger,
    Errors,
    OS,
} from "./util/mod.ts";


export default async function run(path: string) {
    try {
        const f = await OS.readSourceFile(path);
        Logger.info(`Running: ${path} [${f.fsPath}]`);
        const m = parse(f);
        // m.functions.forEach(x => console.log(x));
        // m.structs.forEach(x => console.log(x));
        infer(m);
        check(m);
        const b = transform(m);
        b.toConsole();
    }
    catch (e) {
        if (e instanceof Errors.Debug) {
            throw e;
        }
        else {
            Logger.error(e)
        }
    }
}