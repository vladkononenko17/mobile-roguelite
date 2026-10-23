/**
 * Developer tools (tune panel, map view, URL shortcuts such as ?wave= / ?weapon= / ?model=) are on in
 * the dev server and, on a deployed build, only with ?debug=1 - players never stumble into them.
 */
export const DEV_MODE: boolean = import.meta.env.DEV || new URLSearchParams(location.search).get("debug") === "1";
