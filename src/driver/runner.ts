/*
 * Copyright (c) 2020 Sieve
 *
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 */
import {
    Config,
    Logger,
    Errors,
    OS,
} from "./mod.ts";
import {D, parseFile, Block} from "../parser/mod.ts";
import { check } from "../semantics/check.ts";
// import { vm_gen_code } from "./codegen/mod.ts";
// import { Vm } from "./vm/mod.ts";

async function runFile(path: string, args: string[], c: Config) {
    const [global, mods]: [Block, D.ModuleDef[]] = await parseFile(c.base, path);
    check(global, mods);
    /*rewrite(global, mods);
    const vme = vm_gen_code(mods);
    const xs = vme.asBytes();
    if (c.dump) OS.writeBinaryFile("./dump.bin", xs);
    Logger.debug("@@--------VM.EXEC--------@@");
    const vm = Vm.build(vme.importsOffset);
    vm.exec(xs, args);
     */
}

export async function run(args: string[], c: Config) {
    try {
        const path = args.shift() || "";
        runFile(path, args, c);
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