/*
 * Copyright (c) 2020 Sieve
 *
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 */
import {Dictionary} from "../util/mod.ts";
import {P} from "./mod.ts";
import {parse, parseNative} from "./mod.internal.ts";
import {Errors, Logger, OS} from "../util/mod.ts";

async function parseModule(modules: Dictionary<P.Module>, id: string, base: string, path: string) {
    Logger.info(`base: ${base}, id: ${id}, path: ${path}`);
    const f = await OS.readSourceFile(path);
    Logger.info(`Running: ${path} [${f.fsPath}]`);
    const m = parse(id, f);
    modules[m.id] = m;
    for (const im of m.imports) {
        if (!modules[im.id]) {
            const mid = im.id.replaceAll(/\./g, "/");
            const ad = `${base}${mid}`;
            const a1 = `${base}${mid}/mod.ut`;
            const a2 = `${base}${mid}.ut`;
            await parseModule(modules, im.id, base, OS.isDir(ad) ? a1 : a2);
        }
    }
}

function getFileName(path: string) {
    const a = path.lastIndexOf("/")+1;
    const b = path.lastIndexOf(".");
    if (a < b) {
        return path.substring(a, b);
    }
    else {
        Errors.raiseDebug(path);
    }
}

async function parseFile(path: string) {
    const modules: Dictionary<P.Module> = {};
    const nm = parseNative();

    path = path.replaceAll(/\\/g, "/");
    const id = getFileName(path);
    const base = path.substring(0, path.indexOf("/")+1);
    await parseModule(modules, id, base, path);

    const mods = [];
    mods.push(nm);
    mods.push(modules[id]);

    mods.push(...Object.keys(modules).map(x => modules[x]).filter(x => x.id !== id));
    return mods;
}

export {
    parseFile,
}