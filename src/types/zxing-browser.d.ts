declare module '@zxing/browser' {
  export class BrowserMultiFormatReader {
    static listVideoInputDevices() {
      throw new Error("Method not implemented.");
    }
    decodeFromVideoDevice(deviceId: string | null, video: HTMLVideoElement, callback: (res: any) => void): Promise<void>;
    reset(): void;
  }
  export function listVideoInputDevices(): Promise<MediaDeviceInfo[]>;
}
