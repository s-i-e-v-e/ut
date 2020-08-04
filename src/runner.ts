/*
 * Copyright (c) 2020 Sieve
 *
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 */
import { parseFile, P } from "./parser/mod.ts";
import { check, rewrite } from "./semantics/mod.ts";
import {
    Logger,
    Errors,
    LogLevel,
    OS,
} from "./util/mod.ts";
import { vm_gen_code } from "./codegen/mod.ts";
import { Vm } from "./vm/mod.ts";

export interface Config {
    logLevel: LogLevel,
    dump: boolean,
}

function process(mods: P.Module[], args: string[], c: Config) {
    const global = check(mods);
    rewrite(global, mods);
    const vme = vm_gen_code(mods);
    const xs = vme.asBytes();
    if (c.dump) OS.writeBinaryFile("./dump.bin", xs);
    Logger.debug("@@--------VM.EXEC--------@@");
    const vm = Vm.build(vme.importsOffset);
    vm.exec(xs, args);
}

export async function run(args: string[], c: Config) {
    try {
        const path = args.shift() || "";
        const mods = await parseFile(path);
        process(mods, args, c);
    }
    catch (e) {
        if (e instanceof Errors.UtError) {
            if (c.logLevel > LogLevel.INFO) {
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