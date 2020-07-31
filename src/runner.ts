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

function process(mods: P.Module[], dump: boolean) {
    const global = check(mods);
    const types = rewrite(global, mods);
    const vme = vm_gen_code(types, mods);
    const xs = vme.asBytes();
    if (dump) OS.writeBinaryFile("./dump.bin", xs);
    Logger.debug("@@--------VM.EXEC--------@@");
    const vm = Vm.build(vme.importsOffset);
    vm.exec(xs);
}

export default async function run(path: string, logLevel: number) {
    try {
        const mods = await parseFile(path);
        process(mods, logLevel > LogLevel.INFO);
    }
    catch (e) {
        if (e instanceof Errors.UtError) {
            if (logLevel > LogLevel.INFO) {
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