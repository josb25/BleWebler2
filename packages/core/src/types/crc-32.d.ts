declare module 'crc-32' {
    export function str(str: string): number;
    export function bstr(bstr: string): number;
    export function buf(buf: Uint8Array | number[]): number;
}
