/*
 * Copyright (c) 2020 Sieve
 *
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 */
import parse from "./parser/parser.ts";
import {
    check,
} from "./semantics/mod.ts";
import {
    Logger,
    Errors,
    OS,
} from "./util/mod.ts";
import { vm_gen_code } from "./codegen/mod.ts";
import { Vm } from "./vm/mod.ts";

export default async function run(path: string) {
    try {
        const f = await OS.readSourceFile(path);
        Logger.info(`Running: ${path} [${f.fsPath}]`);
        const m = parse(f);
        check(m);

        const vme = vm_gen_code(m);
        const vm = Vm.build();
        const xs = vme.asBytes();
        //await Deno.writeFile("./dump.bin", xs);
        vm.exec(xs);
    }
    catch (e) {
        if (e instanceof Errors.UtError) {
            Logger.error(e);
            //throw e;
        }
        else {
            throw e;
        }
    }
}