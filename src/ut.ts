/*
 * Copyright (c) 2020 Sieve
 *
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 */
import run from "./runner.ts";
import { OS } from "./util/mod.ts";

function help() {
    console.log("ut 0.1");
    console.log("USAGE:");
    console.log("   ut run <file>");
    console.log("   ut help");
}

async function main(args: string[]) {
    const cmd = args[0];
    const p1 = args[1];

    switch (cmd) {
        case undefined:
        case "help": help(); break;
        case "run": await run(p1); break;
        default: OS.panic(`Unknown command: ${cmd}`);
    }
}

await main(Deno.args);