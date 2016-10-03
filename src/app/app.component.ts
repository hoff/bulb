import { Component, OnInit, ChangeDetectorRef, } from '@angular/core'

interface navigator {
  bluetooth: {
    requestDevice({}): any
  }
}
declare var navigator: navigator

@Component({
  selector: 'app-root',
  templateUrl: './app.component.html',
  styleUrls: ['./app.component.css']
})
export class AppComponent implements OnInit {

  // bulb device constants
  SERVICE_ID = 0xffe5
  CHARACTERISTIC_ID = 0xffe9

  // application vars
  connecting: boolean
  devices: any[] = []
  debug: boolean = false

  // RAINBOW SETTINGS
  // if the rainbow is running
  rainbowRunning: boolean = false
  // how often each bulb is updated
  intervalMS: number = 100
  // lightness and saturation
  defaultLightness: number = 0.08
  defaultSaturation: number = 1
  // how far colors are apart
  hueDistance: number = 0.04
  // how quickly a buld moves along hue
  hueChangeStep: number = 0.01

  constructor(private changeDetector: ChangeDetectorRef) { }

  /**
   * Lifeclye OnInit
   */
  ngOnInit() {
    // disconnect from all device when before window unloads
    window.onbeforeunload = () => {

      // this prevent from re-connecting (because write operation might be in progress)
      //this.disconnectAll()
    }
  }

  /**
   * Prompts the user to connect to a bluetooth bulb within range.
   * On succes, turns the bulb green, and adds it to our devices array.
   */
  connect() {
    navigator.bluetooth.requestDevice({
      filters: [{ services: [this.SERVICE_ID] }]
    }).then((device) => {

      // prevent duplicate connection (make more elegant)
      let duplicate = false
      this.devices.forEach((connectedDevice) => {
        if (device.name === connectedDevice.name) { duplicate = true }
      })
      if (duplicate) { return }

      // connect and store device object
      device.gatt.connect()
        .then(server => server.getPrimaryService(this.SERVICE_ID))
        .then(service => service.getCharacteristic(this.CHARACTERISTIC_ID))
        .then(characteristic => {
          this.connecting = false
          // make a device object (improvement: make it a class)
          let newDevice = {
            device: device,
            characteristic: characteristic,
            name: device.name,
            busy: false,
            writeAttemptCount: 0,
            writeSuccessCount: 0,
            writeErrorCount: 0,
          }
          // turn bulb green to indicate availability
          this.setRGB(newDevice, 0, 255, 0)
          this.devices.push(newDevice)
        })
        .catch(err => {
          console.error('BLE Connection failed!', err)
          this.connecting = false
        })
    }).catch(err => {
      // user cancelled, fair enough...
      return
    })
  }

  /* Disconnects a single device */
  disconnect(device, i) {
    // TODO: not dry, repeated in disconnect all
    this.setRGB(device, 255, 0, 0, () => {
      device.device.gatt.disconnect()
      this.devices.splice(i)
    })
  }

  /**
   * Disconnects all devices and sets their color to red
   */
  disconnectAll() {
    this.devices.forEach((device, i) => {
      this.setRGB(device, 255, 0, 0, () => {
        device.device.gatt.disconnect()
        this.devices.splice(i)
      })
    })
  }

  /**
   * Event listeren: 
   * Sets a bulb's color according to user input.
   */
  setColor(device, $event) {
    let hex = $event.target.value
    let rgb = this.hexToRgb(hex)
    this.setRGB(device, rgb.r, rgb.g, rgb.b)
  }

  /**
   * Changes to color of a given device, to given r, b, and b values.
   * Records updated color information on the device object.
   */
  setRGB(device, red: number, green: number, blue: number, callback?: Function) {
    let color = new Uint8Array([0x56, red, green, blue, 0x00, 0xf0, 0xaa])
    if (device.busy) {
      // record error
      device.writeErrorCount += 1
    } else {
      device.busy = true
      device.characteristic.writeValue(color).then((res) => {
        // record success
        device.writeSuccessCount += 1
        // record rgb
        device.red = red, device.green = green, device.blue = blue
        // record hsl
        let hsl = this.rgbToHsl(red, green, blue)
        device.hue = hsl[0], device.sat = hsl[1], device.light = hsl[2]
        // record hex
        device.hex = this.rgbToHex(red, green, blue)
        // record display hex (lighter) :)
        let howFarFarFromOnePercent = (1- device.light) *100
        let adjustPercent = howFarFarFromOnePercent // should end at 90
        // find a better way of lightening the color...
        device.displayHex = this.lightenDarkenColor(device.hex, 110)
        // good to go
        device.busy = false
        this.changeDetector.detectChanges()

        // callback
        if (callback) {
          console.log('callback', callback)
          callback()
        }
      })
    }
    device.writeAttemptCount += 1
  }

  /**
   * Called at interval: Increases the hue value for each device 
   * according to hueChangeStep setting.
   */
  rainbowStep() {
    this.devices.forEach((device) => {
      let newHue = (device.hue += +this.hueChangeStep) % 1
      let newRGB = this.hslToRgb(newHue, +this.defaultSaturation, +this.defaultLightness)
      this.setRGB(device, newRGB[0], newRGB[1], newRGB[2])
    })
  }

  /**
   * Starts the rainbow animation
   */
  startRainbow() {
    this.rainbowRunning = true
    this.runRainbow()
  }

  /**
   * Recursive loop to rainbow animate the bulbs.
   */
  runRainbow() {
    if (!this.rainbowRunning) { return }
    this.rainbowStep()
    setTimeout(() => this.runRainbow(), this.intervalMS)
  }

  /**
   * Stops the rainbox animation
   */
  stopRainbow() {
    this.rainbowRunning = false
  }

  /**
   * Sets the colors for our devices with hue distance
   * as specified in the hueDistance setting,
   * and lightness/saturation by their global settings
   */
  rainbowSetup() {
    let currentHue = 0
    this.devices.forEach((device) => {
      let rgb = this.hslToRgb(currentHue, +this.defaultSaturation, +this.defaultLightness)
      this.setRGB(device, rgb[0], rgb[1], rgb[2])
      currentHue += (+this.hueDistance) % 1
    })
  }

  /**
   * Reset errors metrics to zero for all device
   */
  resetErrors(): void {
    this.devices.forEach((device) => {
      device.writeErrorCount = 0
      device.writeSuccessCount = 0
      device.writeAttemptCount = 0
    })
  }





  // COLOR UTILITY FUNCTIONS

  lightenDarkenColor (col, amt) {

    var usePound = false;

    if (col[0] == "#") {
      col = col.slice(1);
      usePound = true;
    }

    var num = parseInt(col, 16);

    var r = (num >> 16) + amt;

    if (r > 255) r = 255;
    else if (r < 0) r = 0;

    var b = ((num >> 8) & 0x00FF) + amt;

    if (b > 255) b = 255;
    else if (b < 0) b = 0;

    var g = (num & 0x0000FF) + amt;

    if (g > 255) g = 255;
    else if (g < 0) g = 0;

    return (usePound ? "#" : "") + (g | (b << 8) | (r << 16)).toString(16);

  }

  /**
   * Converts rbg numbers to a hex string
   * Assumes that r, b, and b are between 0 and 255
   * Return a hex value like #FFDD03
   * 
   * @param  {number} r  The red
   * @param  {number} g  The green
   * @param  {number} b  The blue
   * @return {string}    The hexadecimal representation
   */
  rgbToHex(r: number, g: number, b: number): string {
    return "#" + this.componentToHex(r) + this.componentToHex(g) + this.componentToHex(b)
  }

  // helper function
  componentToHex(c: number): string {
    var hex = c.toString(16);
    return hex.length == 1 ? "0" + hex : hex;
  }

  /**
   * Converts an HSL color value to RGB. Conversion formula
   * Assumes h, s, and l are contained in the set [0, 1] and
   * returns r, g, and b in the set [0, 255].
   *
   * @param   {number}  h       The hue
   * @param   {number}  s       The saturation
   * @param   {number}  l       The lightness
   * @return  {Array}           The RGB representation
   */
  hslToRgb(h, s, l) {
    var r, g, b;

    if (s == 0) {
      r = g = b = l; // achromatic
    } else {
      var hue2rgb = function hue2rgb(p, q, t) {
        if (t < 0) t += 1;
        if (t > 1) t -= 1;
        if (t < 1 / 6) return p + (q - p) * 6 * t;
        if (t < 1 / 2) return q;
        if (t < 2 / 3) return p + (q - p) * (2 / 3 - t) * 6;
        return p;
      }

      var q = l < 0.5 ? l * (1 + s) : l + s - l * s;
      var p = 2 * l - q;
      r = hue2rgb(p, q, h + 1 / 3);
      g = hue2rgb(p, q, h);
      b = hue2rgb(p, q, h - 1 / 3);
    }
    return [Math.round(r * 255), Math.round(g * 255), Math.round(b * 255)];
  }

  /**
   * Converts an RGB color value to HSL. Conversion formula
   * adapted from http://en.wikipedia.org/wiki/HSL_color_space.
   * Assumes r, g, and b are contained in the set [0, 255] and
   * returns h, s, and l in the set [0, 1].
   *
   * @param   {number}  r       The red color value
   * @param   {number}  g       The green color value
   * @param   {number}  b       The blue color value
   * @return  {Array}           The HSL representation
   */
  rgbToHsl(r, g, b) {
    r /= 255, g /= 255, b /= 255;
    var max = Math.max(r, g, b), min = Math.min(r, g, b);
    var h, s, l = (max + min) / 2;

    if (max == min) {
      h = s = 0; // achromatic
    } else {
      var d = max - min;
      s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
      switch (max) {
        case r: h = (g - b) / d + (g < b ? 6 : 0); break;
        case g: h = (b - r) / d + 2; break;
        case b: h = (r - g) / d + 4; break;
      }
      h /= 6;
    }
    return [h, s, l];
  }

  /**
   * Converts hex string to rgb object with r, g, and b as properties
   * 
   * @param {string} hex   The hex string you wish to convert
   */
  hexToRgb(hex: string) {
    var result = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
    return result ? {
      r: parseInt(result[1], 16),
      g: parseInt(result[2], 16),
      b: parseInt(result[3], 16)
    } : null;
  }
}
