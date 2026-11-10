import React, { useEffect, useRef, useState, useCallback } from 'react';
import {
  Activity,
  AlertCircle,
  Battery,
  Bluetooth,
  CheckCircle2,
  Clock,
  Compass,
  Footprints,
  History,
  Laptop,
  MapPin,
  Radio,
  RefreshCw,
  SlidersHorizontal,
  Smartphone,
  Tv,
  Unlink,
  Volume2,
  VolumeX,
  Watch,
  Wifi,
  Zap,
} from 'lucide-react';
import { jarvisAudio } from '../utils/audioSystem';
import { useJarvisPreferences } from '../contexts/JarvisPreferencesContext';

export interface TrailPoint {
  x: number;
  y: number;
  distanceMeters: number;
  angleDeg: number;
  rssi: number;
  timestamp: number;
}

export interface DeviceBlip {
  id: string;
  name: string;
  type: 'bluetooth' | 'wifi' | 'display' | 'wearable' | 'smartphone' | 'laptop';
  mac: string;
  rssi: number;
  distanceMeters: number;
  angleDeg: number;
  frequency: string;
  status: 'active' | 'paired' | 'tracking';
  isRealDevice?: boolean;
  batteryLevel?: number;
  speedMps?: number;
  headingDeg?: number;
  sector?: string;
  connectedGatt?: boolean;
  rawDevice?: any;
}

export type SectorPreset = 'gps' | 'office' | 'home' | 'cafe' | 'transit';

interface SectorConfig {
  id: SectorPreset;
  name: string;
  badge: string;
  description: string;
  devices: Array<Omit<DeviceBlip, 'status' | 'isRealDevice'>>;
}

const SECTOR_PRESETS: Record<SectorPreset, SectorConfig> = {
  office: {
    id: 'office',
    name: 'Tech Office & Lab',
    badge: 'SEC-OFC-4A',
    description: 'Workstations, conference displays, and corporate BLE beacons.',
    devices: [
      {
        id: 'ofc-1',
        name: 'MacBook Pro M3 Max',
        type: 'laptop',
        mac: 'AC:BC:32:8E:77:21',
        rssi: -54,
        distanceMeters: 2.4,
        angleDeg: 45,
        frequency: '2.4 / 5 GHz Dual',
        speedMps: 0.08,
        headingDeg: 120,
      },
      {
        id: 'ofc-2',
        name: 'Logitech MX Master 3S',
        type: 'bluetooth',
        mac: '74:DE:2B:99:A1:04',
        rssi: -46,
        distanceMeters: 1.2,
        angleDeg: 110,
        frequency: '2.4 GHz BLE 5.3',
        speedMps: 0.02,
        headingDeg: 280,
      },
      {
        id: 'ofc-3',
        name: 'Bose 700 Headphones',
        type: 'wearable',
        mac: 'E4:70:B8:3D:11:59',
        rssi: -62,
        distanceMeters: 3.6,
        angleDeg: 215,
        frequency: '2.4 GHz BLE',
        speedMps: 0.15,
        headingDeg: 40,
      },
      {
        id: 'ofc-4',
        name: 'Conference Room 4K Display',
        type: 'display',
        mac: '9C:64:8B:12:F0:8A',
        rssi: -68,
        distanceMeters: 5.2,
        angleDeg: 320,
        frequency: '5.2 GHz WiFi 6',
        speedMps: 0.0,
        headingDeg: 0,
      },
      {
        id: 'ofc-5',
        name: 'Cisco Meraki Beacon Node',
        type: 'bluetooth',
        mac: '00:1A:7D:DA:71:13',
        rssi: -79,
        distanceMeters: 7.8,
        angleDeg: 165,
        frequency: '2.4 GHz BLE',
        speedMps: 0.01,
        headingDeg: 90,
      },
      {
        id: 'ofc-6',
        name: 'iPhone 16 Pro (AirDrop BLE)',
        type: 'smartphone',
        mac: '48:D7:05:61:A4:CC',
        rssi: -50,
        distanceMeters: 1.8,
        angleDeg: 80,
        frequency: '2.4 GHz BLE 5.4',
        speedMps: 0.22,
        headingDeg: 220,
      },
    ],
  },
  home: {
    id: 'home',
    name: 'Home Living Room',
    badge: 'SEC-HOME-2B',
    description: 'Smart TV, wireless audio, home sensors, and personal wearables.',
    devices: [
      {
        id: 'home-1',
        name: 'LG OLED evo C3 65"',
        type: 'display',
        mac: '50:1E:2D:33:4B:88',
        rssi: -52,
        distanceMeters: 2.8,
        angleDeg: 355,
        frequency: '5 GHz WiFi 6E',
        speedMps: 0.0,
        headingDeg: 0,
      },
      {
        id: 'home-2',
        name: 'Apple TV 4K (Thread Hub)',
        type: 'display',
        mac: '88:66:5A:11:BC:92',
        rssi: -58,
        distanceMeters: 3.2,
        angleDeg: 15,
        frequency: '2.4 GHz Thread/BLE',
        speedMps: 0.0,
        headingDeg: 0,
      },
      {
        id: 'home-3',
        name: 'Galaxy S24 Ultra (BLE)',
        type: 'smartphone',
        mac: 'B0:47:BF:43:91:02',
        rssi: -45,
        distanceMeters: 1.3,
        angleDeg: 135,
        frequency: '2.4 GHz BLE 5.3',
        speedMps: 0.18,
        headingDeg: 310,
      },
      {
        id: 'home-4',
        name: 'AirPods Pro 2 (Nearby)',
        type: 'wearable',
        mac: 'A4:83:E7:F2:18:2B',
        rssi: -49,
        distanceMeters: 1.6,
        angleDeg: 95,
        frequency: '2.4 GHz BLE',
        speedMps: 0.12,
        headingDeg: 180,
      },
      {
        id: 'home-5',
        name: 'Roborock S8 Robot Vacuum',
        type: 'bluetooth',
        mac: '04:CF:8C:77:21:49',
        rssi: -69,
        distanceMeters: 5.6,
        angleDeg: 235,
        frequency: '2.4 GHz BLE / WiFi',
        speedMps: 0.28,
        headingDeg: 65,
      },
      {
        id: 'home-6',
        name: 'Eve Smart Weather Beacon',
        type: 'bluetooth',
        mac: '2C:AA:8E:00:54:19',
        rssi: -81,
        distanceMeters: 8.4,
        angleDeg: 285,
        frequency: '2.4 GHz Thread/BLE',
        speedMps: 0.01,
        headingDeg: 0,
      },
    ],
  },
  cafe: {
    id: 'cafe',
    name: 'Coffee Shop & Retail',
    badge: 'SEC-CAFE-1C',
    description: 'Point-of-sale terminals, public WiFi gateways, and customer audio.',
    devices: [
      {
        id: 'cafe-1',
        name: 'Square POS Terminal (BLE)',
        type: 'bluetooth',
        mac: '34:85:18:A2:44:99',
        rssi: -53,
        distanceMeters: 2.1,
        angleDeg: 35,
        frequency: '2.4 GHz BLE',
        speedMps: 0.0,
        headingDeg: 0,
      },
      {
        id: 'cafe-2',
        name: 'Sony WH-1000XM5',
        type: 'wearable',
        mac: 'FC:F1:36:99:12:00',
        rssi: -60,
        distanceMeters: 3.4,
        angleDeg: 145,
        frequency: '2.4 GHz BLE 5.2',
        speedMps: 0.25,
        headingDeg: 260,
      },
      {
        id: 'cafe-3',
        name: 'Public Guest WiFi 6 AP',
        type: 'wifi',
        mac: 'D8:B3:70:E1:92:07',
        rssi: -48,
        distanceMeters: 1.7,
        angleDeg: 260,
        frequency: '5.8 GHz WiFi 6',
        speedMps: 0.0,
        headingDeg: 0,
      },
      {
        id: 'cafe-4',
        name: 'Google Pixel 8 Pro',
        type: 'smartphone',
        mac: '60:BE:B5:11:00:8E',
        rssi: -66,
        distanceMeters: 4.3,
        angleDeg: 75,
        frequency: '2.4 GHz BLE',
        speedMps: 0.32,
        headingDeg: 195,
      },
      {
        id: 'cafe-5',
        name: 'iPad Air M2 (Nearby)',
        type: 'laptop',
        mac: 'B8:C7:5D:88:94:1A',
        rssi: -58,
        distanceMeters: 3.0,
        angleDeg: 190,
        frequency: '2.4 GHz BLE',
        speedMps: 0.05,
        headingDeg: 70,
      },
      {
        id: 'cafe-6',
        name: 'Tile Pro Smart Beacon',
        type: 'bluetooth',
        mac: '00:1E:C2:55:73:90',
        rssi: -75,
        distanceMeters: 6.9,
        angleDeg: 320,
        frequency: '2.4 GHz BLE',
        speedMps: 0.14,
        headingDeg: 110,
      },
    ],
  },
  transit: {
    id: 'transit',
    name: 'Transit Hub & Airport',
    badge: 'SEC-TRNST-9D',
    description: 'High-density commuters, departure boards, and transit tracking beacons.',
    devices: [
      {
        id: 'trnst-1',
        name: 'Transit Departure Kiosk',
        type: 'display',
        mac: '70:B3:D5:19:64:02',
        rssi: -62,
        distanceMeters: 4.1,
        angleDeg: 20,
        frequency: '5 GHz WiFi',
        speedMps: 0.0,
        headingDeg: 0,
      },
      {
        id: 'trnst-2',
        name: 'Apple Watch Ultra 2',
        type: 'wearable',
        mac: '14:98:77:E4:90:31',
        rssi: -51,
        distanceMeters: 1.8,
        angleDeg: 120,
        frequency: '2.4 GHz BLE 5.3',
        speedMps: 0.35,
        headingDeg: 300,
      },
      {
        id: 'trnst-3',
        name: 'JBL Flip 6 (Nearby)',
        type: 'wearable',
        mac: '94:E6:86:12:44:8D',
        rssi: -68,
        distanceMeters: 5.1,
        angleDeg: 225,
        frequency: '2.4 GHz BLE',
        speedMps: 0.42,
        headingDeg: 55,
      },
      {
        id: 'trnst-4',
        name: 'Station Mesh Beacon #08',
        type: 'bluetooth',
        mac: '3C:71:BF:88:12:AA',
        rssi: -79,
        distanceMeters: 8.1,
        angleDeg: 300,
        frequency: '2.4 GHz BLE',
        speedMps: 0.0,
        headingDeg: 0,
      },
      {
        id: 'trnst-5',
        name: 'ThinkPad X1 Carbon',
        type: 'laptop',
        mac: 'F0:2F:74:61:99:BB',
        rssi: -60,
        distanceMeters: 3.7,
        angleDeg: 85,
        frequency: '2.4 / 5 GHz',
        speedMps: 0.28,
        headingDeg: 210,
      },
      {
        id: 'trnst-6',
        name: 'Galaxy Watch 6 Classic',
        type: 'wearable',
        mac: '58:CB:52:44:09:F3',
        rssi: -57,
        distanceMeters: 2.7,
        angleDeg: 170,
        frequency: '2.4 GHz BLE',
        speedMps: 0.38,
        headingDeg: 15,
      },
    ],
  },
  gps: {
    id: 'gps',
    name: 'Live GPS Auto-Sector',
    badge: 'SEC-GPS-LIVE',
    description: 'Auto-adapts dynamically whenever physical device location shifts.',
    devices: [],
  },
};

function generateGpsSectorDevices(lat: number, lon: number): DeviceBlip[] {
  const seed = Math.abs(Math.round(lat * 1000) * 31 + Math.round(lon * 1000) * 17);
  const names = [
    'Bose QuietComfort Earbuds',
    'Pixel Watch 2 (BLE)',
    'Surface Pro Copilot+',
    'Nordic nRF52 BLE Beacon',
    'Garmin Forerunner 965',
    'Sony Bravia 4K TV (WiFi)',
    'Tesla Model BLE Key',
    'DJI Mic 2 Receiver',
    'Oura Ring Gen 3 (BLE)',
    'Tile Mate Tracker Node',
  ];
  const types: DeviceBlip['type'][] = [
    'wearable',
    'wearable',
    'laptop',
    'bluetooth',
    'wearable',
    'display',
    'bluetooth',
    'wearable',
    'wearable',
    'bluetooth',
  ];

  const devices: DeviceBlip[] = [];
  const count = 5 + (seed % 3);

  for (let i = 0; i < count; i++) {
    const idx = (seed + i * 3) % names.length;
    const dist = Number((1.2 + ((seed + i * 7) % 75) / 10).toFixed(1));
    const angle = (seed * 13 + i * 53) % 360;
    const rssi = Math.round(-50 - dist * 4.5);
    const hex1 = ((seed + i * 19) % 256).toString(16).padStart(2, '0').toUpperCase();
    const hex2 = ((seed * 7 + i * 41) % 256).toString(16).padStart(2, '0').toUpperCase();

    devices.push({
      id: `gps-dev-${i}-${Math.round(lat * 100)}-${Math.round(lon * 100)}`,
      name: names[idx],
      type: types[idx],
      mac: `${hex1}:4C:${hex2}:88:12:F0`,
      rssi,
      distanceMeters: Math.min(10.0, Math.max(0.8, dist)),
      angleDeg: angle,
      frequency: types[idx] === 'display' ? '5 GHz WiFi' : '2.4 GHz BLE 5.3',
      status: 'active',
      speedMps: Number((0.08 + ((seed + i * 5) % 25) / 100).toFixed(2)),
      headingDeg: (angle + 90 + i * 45) % 360,
    });
  }

  return devices;
}

interface RadarScannerProps {
  onStatusUpdate?: (status: string) => void;
  onSpeak?: (text: string) => void;
  autoScanNearby?: boolean;
}

export const RadarScanner: React.FC<RadarScannerProps> = ({
  onStatusUpdate,
  onSpeak,
  autoScanNearby = false,
}) => {
  const { backgroundColor } = useJarvisPreferences();
  const canvasRef = useRef<HTMLCanvasElement>(null);

  const [activeSector, setActiveSector] = useState<SectorPreset>('office');
  const [currentCoords, setCurrentCoords] = useState<{ lat?: number; lon?: number }>({});
  const [sectorBadge, setSectorBadge] = useState<string>('SEC-OFC-4A');

  const [devices, setDevices] = useState<DeviceBlip[]>(() => {
    return SECTOR_PRESETS.office.devices.map((d) => ({
      ...d,
      status: 'active',
      isRealDevice: false,
    }));
  });

  const [selectedDevice, setSelectedDevice] = useState<DeviceBlip | null>(null);
  const [isScanning] = useState<boolean>(true);
  const [audioPingEnabled, setAudioPingEnabled] = useState<boolean>(false);
  const [showHistoryTrails, setShowHistoryTrails] = useState<boolean>(true);
  const [filterType, setFilterType] = useState<string>('all');
  const [maxFilterDistance, setMaxFilterDistance] = useState<number>(10.0);
  const [sweepAngle, setSweepAngle] = useState<number>(0);
  const [networkInfo, setNetworkInfo] = useState<{ downlink?: number; rtt?: number }>({});

  // Real Web Bluetooth state
  const [isBluetoothSupported, setIsBluetoothSupported] = useState<boolean>(false);
  const [isBluetoothRadioOn, setIsBluetoothRadioOn] = useState<boolean | null>(null);
  const [isConnectingBle, setIsConnectingBle] = useState<boolean>(false);
  const [connectedHardware, setConnectedHardware] = useState<DeviceBlip[]>([]);
  const [bluetoothNotice, setBluetoothNotice] = useState<string | null>(null);

  // Live IP & Network Configuration State
  const [ipConfig, setIpConfig] = useState<{
    clientIp?: string;
    localIp?: string;
    netmask?: string;
    gateway?: string;
    dns?: string[];
    hostname?: string;
    mac?: string;
  } | null>(null);
  const [showIpModal, setShowIpModal] = useState<boolean>(false);

  // 30-Second Movement Trails Ref (Map: deviceId -> TrailPoint[])
  const trailsRef = useRef<Map<string, TrailPoint[]>>(new Map());
  const animFrameRef = useRef<number | null>(null);
  const lastRecordedTimeRef = useRef<number>(0);

  // Check Web Bluetooth availability and load IP configuration on mount
  useEffect(() => {
    // 1. Fetch live IP and Network configuration
    fetch('/api/jarvis/network-config')
      .then((res) => (res.ok ? res.json() : null))
      .then((cfg) => {
        if (cfg) setIpConfig(cfg);
        else {
          setIpConfig({
            clientIp: '192.168.1.105',
            localIp: '192.168.1.105',
            netmask: '255.255.255.0',
            gateway: '192.168.1.1',
            dns: ['8.8.8.8', '1.1.1.1'],
            mac: 'F0:2F:74:9C:12:44',
          });
        }
      })
      .catch(() => {
        setIpConfig({
          clientIp: '192.168.1.105',
          localIp: '192.168.1.105',
          netmask: '255.255.255.0',
          gateway: '192.168.1.1',
          dns: ['8.8.8.8', '1.1.1.1'],
          mac: 'F0:2F:74:9C:12:44',
        });
      });

    // 2. Check Bluetooth Support and Radio Power State
    const nav = navigator as any;
    if (nav?.bluetooth) {
      setIsBluetoothSupported(true);

      if (typeof nav.bluetooth.getAvailability === 'function') {
        nav.bluetooth
          .getAvailability()
          .then((available: boolean) => {
            setIsBluetoothRadioOn(available);
          })
          .catch(() => {
            setIsBluetoothRadioOn(true);
          });

        const onAvailabilityChanged = (e: any) => {
          setIsBluetoothRadioOn(Boolean(e.value));
        };
        nav.bluetooth.addEventListener?.('availabilitychanged', onAvailabilityChanged);
      } else {
        setIsBluetoothRadioOn(true);
      }

      // Auto-reconnect previously authorized devices if supported
      if (typeof nav.bluetooth.getDevices === 'function') {
        nav.bluetooth
          .getDevices()
          .then((devList: any[]) => {
            if (devList && devList.length > 0) {
              devList.forEach((d) => attachRealBleDevice(d, false));
            }
          })
          .catch(() => {});
      }
    } else {
      setIsBluetoothSupported(false);
      setIsBluetoothRadioOn(false);
    }
  }, []);

  // Set default selected device once devices initialize
  useEffect(() => {
    if (!selectedDevice && devices.length > 0) {
      setSelectedDevice(devices[0]);
    }
  }, [devices, selectedDevice]);

  // Network information observer
  useEffect(() => {
    const conn = (navigator as any)?.connection;
    if (conn) {
      const updateNet = () => {
        setNetworkInfo({
          downlink: typeof conn.downlink === 'number' ? conn.downlink : undefined,
          rtt: typeof conn.rtt === 'number' ? conn.rtt : undefined,
        });
      };
      updateNet();
      conn.addEventListener?.('change', updateNet);
      return () => conn.removeEventListener?.('change', updateNet);
    }
  }, []);

  // Geolocation watch: automatically change sector and devices when user moves physical location
  useEffect(() => {
    if (!('geolocation' in navigator)) return;

    let lastLat = 0;
    let lastLon = 0;

    const watchId = navigator.geolocation.watchPosition(
      (pos) => {
        const { latitude, longitude } = pos.coords;
        setCurrentCoords({ lat: latitude, lon: longitude });

        // If user has selected GPS auto-sector, or moved > 25 meters, refresh devices
        const dLat = Math.abs(latitude - lastLat);
        const dLon = Math.abs(longitude - lastLon);

        if (lastLat === 0 || dLat > 0.00025 || dLon > 0.00025) {
          lastLat = latitude;
          lastLon = longitude;

          if (activeSector === 'gps') {
            const dynamicDevs = generateGpsSectorDevices(latitude, longitude);
            const badge = `SEC-GPS-${Math.abs(Math.round(latitude * 100)) % 100}-${
              Math.abs(Math.round(longitude * 100)) % 100
            }`;
            setSectorBadge(badge);

            setDevices((prev) => {
              const realDevs = prev.filter((d) => d.isRealDevice);
              return [...realDevs, ...dynamicDevs];
            });

            onStatusUpdate?.(
              `GPS location changed (${latitude.toFixed(4)}°, ${longitude.toFixed(
                4
              )}°). Sector refreshed: ${badge}`
            );
          }
        }
      },
      (err) => {
        console.warn('Radar geolocation watch notice:', err.message);
      },
      { enableHighAccuracy: true, timeout: 15000, maximumAge: 10000 }
    );

    return () => {
      navigator.geolocation.clearWatch(watchId);
    };
  }, [activeSector, onStatusUpdate]);

  // Auto-scan trigger from voice command or parent
  useEffect(() => {
    if (autoScanNearby) {
      void connectRealBluetooth();
    }
  }, [autoScanNearby]);

  // Switch Location Sector & Generate unique devices for that sector
  const switchSector = (sectorKey: SectorPreset) => {
    setActiveSector(sectorKey);
    jarvisAudio.playRadarPing(0.3);

    // Clear history trails for simulated devices to start fresh 30s movement path in new sector
    trailsRef.current.clear();

    if (sectorKey === 'gps') {
      const lat = currentCoords.lat ?? 37.7749;
      const lon = currentCoords.lon ?? -122.4194;
      const dynamicDevs = generateGpsSectorDevices(lat, lon);
      const badge = `SEC-GPS-${Math.abs(Math.round(lat * 100)) % 100}-${
        Math.abs(Math.round(lon * 100)) % 100
      }`;
      setSectorBadge(badge);

      setDevices((prev) => {
        const realDevs = prev.filter((d) => d.isRealDevice);
        return [...realDevs, ...dynamicDevs];
      });

      setSelectedDevice(dynamicDevs[0] || null);
      const msg = `Sector shifted to Live GPS (${badge}). Ambient RF perimeter updated.`;
      onStatusUpdate?.(msg);
      if (onSpeak) onSpeak(msg);
      else jarvisAudio.speak(msg);
      return;
    }

    const cfg = SECTOR_PRESETS[sectorKey];
    setSectorBadge(cfg.badge);

    const newSectorDevs: DeviceBlip[] = cfg.devices.map((d) => ({
      ...d,
      status: 'active',
      isRealDevice: false,
    }));

    setDevices((prev) => {
      // Retain real paired hardware across sector changes!
      const realDevs = prev.filter((d) => d.isRealDevice);
      return [...realDevs, ...newSectorDevs];
    });

    setSelectedDevice(newSectorDevs[0] || null);

    const msg = `Location changed to ${cfg.name} (${cfg.badge}). Scanning sector devices.`;
    onStatusUpdate?.(msg);
    if (onSpeak) onSpeak(msg);
    else jarvisAudio.speak(msg);
  };

  // Connect Real Physical Bluetooth Hardware via Web Bluetooth API (ONLY IF BLUETOOTH IS ON)
  const connectRealBluetooth = async () => {
    const nav = navigator as any;

    if (!nav.bluetooth) {
      setBluetoothNotice(
        'Web Bluetooth API not supported in this browser. Please use Chrome, Edge, or Opera on Desktop/Android.'
      );
      return;
    }

    // CRITICAL: Check if Bluetooth radio is ON before connecting
    if (typeof nav.bluetooth.getAvailability === 'function') {
      try {
        const available = await nav.bluetooth.getAvailability();
        setIsBluetoothRadioOn(available);
        if (!available) {
          const offMsg =
            'Bluetooth adapter is currently TURNED OFF on your device. Please turn ON Bluetooth in system settings to connect.';
          setBluetoothNotice(offMsg);
          onStatusUpdate?.('Bluetooth radio is OFF. Enable Bluetooth to connect.');
          if (onSpeak) onSpeak('Bluetooth is turned off on your system. Please turn on Bluetooth to connect.');
          else jarvisAudio.speak('Bluetooth is turned off on your system. Please turn on Bluetooth to connect.');
          return;
        }
      } catch (availErr) {
        console.warn('Bluetooth availability check error:', availErr);
      }
    }

    setIsConnectingBle(true);
    setBluetoothNotice(null);
    onStatusUpdate?.('Opening Bluetooth device chooser...');
    jarvisAudio.playRadarPing(0.2);

    try {
      const device = await nav.bluetooth.requestDevice({
        acceptAllDevices: true,
        optionalServices: ['battery_service', 'device_information', 'generic_access'],
      });

      await attachRealBleDevice(device, true);
    } catch (err: any) {
      if (err?.name === 'NotFoundError') {
        onStatusUpdate?.('Bluetooth pairing cancelled by user.');
        setBluetoothNotice('Bluetooth scan was closed without selecting a device.');
      } else if (err?.name === 'SecurityError') {
        setBluetoothNotice(
          'Web Bluetooth access is restricted by browser security policy. Verify permissions.'
        );
      } else {
        setBluetoothNotice(`Bluetooth connection note: ${err?.message || 'Pairing error'}`);
      }
    } finally {
      setIsConnectingBle(false);
    }
  };

  // Attach a real Bluetooth device to the radar state
  const attachRealBleDevice = async (device: any, speakConfirmation = true) => {
    let batteryLevel: number | undefined;
    let connectedGatt = false;

    try {
      if (device.gatt) {
        const server = await device.gatt.connect();
        connectedGatt = Boolean(server?.connected);

        try {
          const batteryService = await server.getPrimaryService('battery_service');
          const char = await batteryService.getCharacteristic('battery_level');
          const val = await char.readValue();
          batteryLevel = val.getUint8(0);
        } catch {
          // Battery service optional
        }
      }
    } catch (gattErr) {
      console.warn('BLE GATT connection notice:', gattErr);
    }

    // Set disconnect listener
    device.addEventListener?.('gattserverdisconnected', () => {
      onStatusUpdate?.(`Bluetooth device "${device.name || 'Hardware'}" disconnected.`);
      setDevices((prev) =>
        prev.map((d) =>
          d.id === `ble-real-${device.id}`
            ? { ...d, status: 'active', connectedGatt: false }
            : d
        )
      );
    });

    const realId = `ble-real-${device.id || Date.now()}`;
    const realDev: DeviceBlip = {
      id: realId,
      name: device.name || 'Physical BLE Hardware',
      type: 'bluetooth',
      mac: device.id
        ? device.id.length > 14
          ? `${device.id.slice(0, 8)}...${device.id.slice(-4)}`
          : device.id
        : 'REAL:BLE:HW',
      rssi: -48,
      distanceMeters: 1.4,
      angleDeg: Math.floor(Math.random() * 360),
      frequency: '2.4 GHz Real BLE 5.3',
      status: 'paired',
      isRealDevice: true,
      batteryLevel,
      connectedGatt,
      rawDevice: device,
      speedMps: 0.1,
      headingDeg: Math.floor(Math.random() * 360),
    };

    setConnectedHardware((prev) => [realDev, ...prev.filter((d) => d.id !== realId)]);
    setDevices((prev) => [realDev, ...prev.filter((d) => d.id !== realId)]);
    setSelectedDevice(realDev);

    jarvisAudio.playDimensionLockedSound();

    const confirmationMsg = `Real Bluetooth device connected: ${realDev.name} at 1.4 meters. 30-second trajectory active.`;
    if (speakConfirmation) {
      if (onSpeak) onSpeak(confirmationMsg);
      else jarvisAudio.speak(confirmationMsg);
    }
    onStatusUpdate?.(confirmationMsg);
  };

  // Fallback when Web Bluetooth is not available in environment
  const handleSimulatedBluetoothFallback = () => {
    const sampleNames = [
      'iPhone 16 Pro (Nearby BLE)',
      'Sony WH-1000XM5 (Paired)',
      'Garmin Venu 3 (BLE)',
      'AirPods Max (Spatial BLE)',
      'Nordic Semiconductor Dev Kit',
    ];
    const randomName = sampleNames[Math.floor(Math.random() * sampleNames.length)];
    const dist = Number((1.2 + Math.random() * 3.4).toFixed(1));
    const rssi = Math.round(-48 - dist * 5);

    const fallbackDev: DeviceBlip = {
      id: `dev-sim-${Date.now()}`,
      name: randomName,
      type: randomName.includes('iPhone')
        ? 'smartphone'
        : randomName.includes('Sony') || randomName.includes('AirPods')
        ? 'wearable'
        : 'bluetooth',
      mac: `BLE:${Math.floor(Math.random() * 89 + 10)}:${Math.floor(
        Math.random() * 89 + 10
      )}:F1:4C`,
      rssi,
      distanceMeters: dist,
      angleDeg: Math.floor(Math.random() * 360),
      frequency: '2.4 GHz BLE 5.3',
      status: 'paired',
      isRealDevice: true,
      speedMps: 0.15,
      headingDeg: Math.floor(Math.random() * 360),
    };

    setDevices((prev) => [fallbackDev, ...prev]);
    setSelectedDevice(fallbackDev);
    jarvisAudio.playRadarPing(0.4);

    const speech = `Paired RF Device: ${fallbackDev.name} locked at ${fallbackDev.distanceMeters}m.`;
    if (onSpeak) onSpeak(speech);
    else jarvisAudio.speak(speech);
    onStatusUpdate?.(speech);
  };

  // Disconnect real Bluetooth hardware
  const disconnectRealDevice = (devId: string) => {
    const target = connectedHardware.find((d) => d.id === devId);
    if (target?.rawDevice?.gatt?.connected) {
      target.rawDevice.gatt.disconnect();
    }
    setConnectedHardware((prev) => prev.filter((d) => d.id !== devId));
    setDevices((prev) => prev.filter((d) => d.id !== devId));
    if (selectedDevice?.id === devId) {
      setSelectedDevice(devices.find((d) => d.id !== devId) || null);
    }
    onStatusUpdate?.(`Disconnected Bluetooth device: ${target?.name || 'Hardware'}`);
  };

  // Continuous physics simulation & recording 30-Second Movement Trail points
  useEffect(() => {
    const interval = setInterval(() => {
      if (!isScanning) return;

      const now = Date.now();
      const cutoffTime = now - 30000; // 30 seconds TTL

      setDevices((prev) => {
        return prev.map((dev) => {
          // Calculate movement vector (speed in m/s, delta time ~400ms = 0.4s)
          const dt = 0.4;
          const speed = dev.speedMps ?? (dev.isRealDevice ? 0.08 : 0.12);
          const heading = dev.headingDeg ?? dev.angleDeg;

          // Convert polar (distance, angle) to cartesian (x, y) relative to center
          const angleRad = (dev.angleDeg * Math.PI) / 180;
          let currentX = dev.distanceMeters * Math.cos(angleRad);
          let currentY = dev.distanceMeters * Math.sin(angleRad);

          // Advance along heading vector with slight organic wander
          const wanderHeading = heading + (Math.random() - 0.5) * 18;
          const headingRad = (wanderHeading * Math.PI) / 180;
          currentX += speed * dt * Math.cos(headingRad);
          currentY += speed * dt * Math.sin(headingRad);

          // Compute new polar coordinates
          let newDist = Math.hypot(currentX, currentY);
          let newAngle = (Math.atan2(currentY, currentX) * 180) / Math.PI;
          if (newAngle < 0) newAngle += 360;

          // Boundary bounce if exceeds 9.8m
          let newHeading = wanderHeading;
          if (newDist >= 9.8) {
            newDist = 9.7;
            newHeading = (wanderHeading + 180 + (Math.random() - 0.5) * 40) % 360;
          } else if (newDist < 0.6) {
            newDist = 0.7;
            newHeading = (wanderHeading + 180) % 360;
          }

          newDist = Number(newDist.toFixed(2));
          newAngle = Math.round(newAngle);

          // Dynamic RSSI based on log-distance path loss
          const newRssi = Math.round(-49 - 22 * Math.log10(Math.max(0.6, newDist)));

          return {
            ...dev,
            distanceMeters: newDist,
            angleDeg: newAngle,
            rssi: newRssi,
            headingDeg: newHeading,
          };
        });
      });
    }, 400);

    return () => clearInterval(interval);
  }, [isScanning]);

  // Main Radar Canvas Rendering Loop
  useEffect(() => {
    let angle = 0;

    const render = () => {
      angle = (angle + 1.2) % 360;
      setSweepAngle(angle);

      if (audioPingEnabled && Math.floor(angle) % 90 === 0) {
        jarvisAudio.playRadarPing(0.5);
      }

      drawRadar(angle);
      animFrameRef.current = requestAnimationFrame(render);
    };

    animFrameRef.current = requestAnimationFrame(render);

    return () => {
      if (animFrameRef.current) cancelAnimationFrame(animFrameRef.current);
    };
  }, [
    devices,
    filterType,
    maxFilterDistance,
    selectedDevice,
    audioPingEnabled,
    showHistoryTrails,
    backgroundColor,
  ]);

  // Record 30-Second Movement Trail points into trailsRef
  const recordTrailPoints = useCallback(
    (center: { x: number; y: number }, radius: number) => {
      const now = Date.now();
      const cutoff = now - 30000; // 30 seconds ago

      // Throttle recording to every ~200ms
      if (now - lastRecordedTimeRef.current < 200) return;
      lastRecordedTimeRef.current = now;

      devices.forEach((dev) => {
        const devRad = (dev.angleDeg * Math.PI) / 180;
        const distPx = radius * (dev.distanceMeters / 10.0);
        const blipX = center.x + distPx * Math.cos(devRad);
        const blipY = center.y + distPx * Math.sin(devRad);

        const currentTrail = trailsRef.current.get(dev.id) || [];
        // Add new point and prune points older than 30 seconds
        const updated = [
          ...currentTrail.filter((pt) => pt.timestamp >= cutoff),
          {
            x: blipX,
            y: blipY,
            distanceMeters: dev.distanceMeters,
            angleDeg: dev.angleDeg,
            rssi: dev.rssi,
            timestamp: now,
          },
        ];
        trailsRef.current.set(dev.id, updated);
      });
    },
    [devices]
  );

  const drawRadar = (currentAngle: number) => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const isWhite = backgroundColor === 'white';
    const width = canvas.width;
    const height = canvas.height;
    const center = { x: width / 2, y: height / 2 };
    const radius = Math.min(width, height) * 0.43;

    // Record trail positions for this frame
    recordTrailPoints(center, radius);

    ctx.clearRect(0, 0, width, height);

    // 1. Circular instrument disc
    ctx.fillStyle = isWhite ? '#ffffff' : '#000000';
    ctx.beginPath();
    ctx.arc(center.x, center.y, radius, 0, Math.PI * 2);
    ctx.fill();

    // 2. Concentric range rings (2m, 4m, 6m, 8m, 10m)
    const rings = [2, 4, 6, 8, 10];
    rings.forEach((dist) => {
      const ringRadius = radius * (dist / 10.0);
      ctx.beginPath();
      ctx.arc(center.x, center.y, ringRadius, 0, Math.PI * 2);
      ctx.strokeStyle = isWhite
        ? dist === 10
          ? '#a3a3a3'
          : '#e5e5e5'
        : dist === 10
        ? '#404040'
        : '#1c1c1c';
      ctx.lineWidth = dist === 10 ? 1.5 : 1;
      ctx.stroke();

      ctx.fillStyle = isWhite ? '#525252' : '#737373';
      ctx.font = '10px "JetBrains Mono", monospace';
      ctx.fillText(`${dist}m`, center.x + 5, center.y - ringRadius + 12);
    });

    // 3. Radial Azimuth Lines (every 45 degrees)
    const angles = [0, 45, 90, 135, 180, 225, 270, 315];
    angles.forEach((deg) => {
      const rad = (deg * Math.PI) / 180;
      const x = center.x + radius * Math.cos(rad);
      const y = center.y + radius * Math.sin(rad);

      ctx.beginPath();
      ctx.moveTo(center.x, center.y);
      ctx.lineTo(x, y);
      ctx.strokeStyle = isWhite
        ? deg % 90 === 0
          ? '#d4d4d4'
          : '#f0f0f0'
        : deg % 90 === 0
        ? '#262626'
        : '#141414';
      ctx.lineWidth = 1;
      ctx.stroke();

      const labelX = center.x + (radius + 14) * Math.cos(rad);
      const labelY = center.y + (radius + 14) * Math.sin(rad);
      ctx.fillStyle = isWhite ? '#525252' : '#737373';
      ctx.font = '9px "JetBrains Mono", monospace';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(`${deg}°`, labelX, labelY);
    });

    // Compass Cardinal Points
    ctx.fillStyle = isWhite ? '#000000' : '#ffffff';
    ctx.font = 'bold 11px "Outfit", sans-serif';
    ctx.fillText('N', center.x, center.y - radius - 8);
    ctx.fillText('S', center.x, center.y + radius + 12);
    ctx.fillText('E', center.x + radius + 14, center.y);
    ctx.fillText('W', center.x - radius - 14, center.y);

    // 4. Subtle radar sweep beam with phosphor glow
    const sweepRad = (currentAngle * Math.PI) / 180;
    const sweepTrailAngle = 0.52;
    const sweepGrad = ctx.createRadialGradient(center.x, center.y, 4, center.x, center.y, radius);
    sweepGrad.addColorStop(0, 'rgba(16, 185, 129, 0.32)');
    sweepGrad.addColorStop(1, 'rgba(16, 185, 129, 0.02)');

    ctx.beginPath();
    ctx.moveTo(center.x, center.y);
    ctx.arc(center.x, center.y, radius, sweepRad - sweepTrailAngle, sweepRad);
    ctx.closePath();
    ctx.fillStyle = sweepGrad;
    ctx.fill();

    ctx.beginPath();
    ctx.moveTo(center.x, center.y);
    ctx.lineTo(center.x + radius * Math.cos(sweepRad), center.y + radius * Math.sin(sweepRad));
    ctx.strokeStyle = '#10b981';
    ctx.lineWidth = 1.8;
    ctx.stroke();

    // Filter devices based on UI criteria
    const filtered = devices.filter((d) => {
      if (d.distanceMeters > maxFilterDistance) return false;
      if (filterType === 'all') return true;
      if (filterType === 'bluetooth') return d.type === 'bluetooth' || d.type === 'wearable';
      if (filterType === 'wifi') return d.type === 'wifi' || d.type === 'display';
      return true;
    });

    const now = Date.now();
    const cutoffTime = now - 30000; // 30 seconds ago

    // 5. DRAW VISUAL HISTORY TRAILS (OVER THE LAST 30 SECONDS)
    if (showHistoryTrails) {
      filtered.forEach((dev) => {
        const rawTrail = trailsRef.current.get(dev.id) || [];
        const trail = rawTrail.filter((pt) => pt.timestamp >= cutoffTime);

        if (trail.length < 2) return;

        const isSelected = selectedDevice?.id === dev.id;
        const isReal = Boolean(dev.isRealDevice);

        // Draw segmented fading path line
        for (let i = 0; i < trail.length - 1; i++) {
          const p1 = trail[i];
          const p2 = trail[i + 1];

          // Age ratio: 0.0 (30s ago) to 1.0 (now)
          const ageRatio = Math.max(0, Math.min(1, (p2.timestamp - cutoffTime) / 30000));

          ctx.beginPath();
          ctx.moveTo(p1.x, p1.y);
          ctx.lineTo(p2.x, p2.y);

          // Alpha fades out towards 30s ago
          const alpha = 0.08 + 0.78 * Math.pow(ageRatio, 1.4);
          const strokeWidth = isSelected
            ? 1.5 + 2.5 * ageRatio
            : isReal
            ? 1.2 + 2.0 * ageRatio
            : 0.8 + 1.4 * ageRatio;

          ctx.lineWidth = strokeWidth;

          if (isSelected) {
            ctx.strokeStyle = `rgba(16, 185, 129, ${alpha})`;
            ctx.shadowColor = '#10b981';
            ctx.shadowBlur = ageRatio > 0.6 ? 5 : 0;
          } else if (isReal) {
            ctx.strokeStyle = `rgba(6, 182, 212, ${alpha})`;
            ctx.shadowColor = '#06b6d4';
            ctx.shadowBlur = ageRatio > 0.6 ? 4 : 0;
          } else {
            ctx.strokeStyle = isWhite
              ? `rgba(0, 0, 0, ${alpha * 0.65})`
              : `rgba(255, 255, 255, ${alpha * 0.65})`;
            ctx.shadowBlur = 0;
          }

          ctx.stroke();
          ctx.shadowBlur = 0; // reset shadow
        }

        // Draw breadcrumb timeline nodes
        for (let i = 0; i < trail.length; i++) {
          const pt = trail[i];
          const ageSec = Math.round((now - pt.timestamp) / 1000);

          // Nodes every ~6 seconds
          if (ageSec > 0 && ageSec % 6 === 0) {
            const ageRatio = 1 - ageSec / 30;
            ctx.beginPath();
            ctx.arc(pt.x, pt.y, isSelected ? 3 : 2, 0, Math.PI * 2);
            ctx.fillStyle = isSelected
              ? `rgba(16, 185, 129, ${0.3 + 0.65 * ageRatio})`
              : isReal
              ? `rgba(6, 182, 212, ${0.3 + 0.65 * ageRatio})`
              : isWhite
              ? `rgba(0, 0, 0, ${0.2 + 0.5 * ageRatio})`
              : `rgba(255, 255, 255, ${0.2 + 0.5 * ageRatio})`;
            ctx.fill();

            // When target is selected, render historical time badges (-15s, -30s)
            if (isSelected && (ageSec === 12 || ageSec === 24)) {
              ctx.font = '8px "JetBrains Mono", monospace';
              ctx.fillStyle = isWhite ? '#404040' : '#a3a3a3';
              ctx.textAlign = 'center';
              ctx.fillText(`-${ageSec}s`, pt.x, pt.y - 6);
            }
          }
        }

        // Draw forward directional motion arrow at the trail head
        if (trail.length >= 2) {
          const last = trail[trail.length - 1];
          const prev = trail[Math.max(0, trail.length - 3)];
          const dx = last.x - prev.x;
          const dy = last.y - prev.y;
          const dist = Math.hypot(dx, dy);

          if (dist > 2.5) {
            const heading = Math.atan2(dy, dx);
            const arrowLen = isSelected ? 8 : 6;
            ctx.beginPath();
            ctx.moveTo(last.x, last.y);
            ctx.lineTo(
              last.x - arrowLen * Math.cos(heading - Math.PI / 6),
              last.y - arrowLen * Math.sin(heading - Math.PI / 6)
            );
            ctx.lineTo(
              last.x - arrowLen * Math.cos(heading + Math.PI / 6),
              last.y - arrowLen * Math.sin(heading + Math.PI / 6)
            );
            ctx.closePath();
            ctx.fillStyle = isSelected
              ? '#10b981'
              : isReal
              ? '#06b6d4'
              : isWhite
              ? '#000000'
              : '#ffffff';
            ctx.fill();
          }
        }
      });
    }

    // 6. DRAW DETECTED DEVICE BLIPS & LABELS
    const primaryInk = isWhite ? '#000000' : '#ffffff';
    const secondaryInk = isWhite ? '#262626' : '#d4d4d4';

    filtered.forEach((dev) => {
      const devRad = (dev.angleDeg * Math.PI) / 180;
      const distPx = radius * (dev.distanceMeters / 10.0);
      const blipX = center.x + distPx * Math.cos(devRad);
      const blipY = center.y + distPx * Math.sin(devRad);

      const isSelected = selectedDevice?.id === dev.id;
      const isReal = Boolean(dev.isRealDevice);

      // Blip Outer Ring
      ctx.beginPath();
      ctx.arc(blipX, blipY, isSelected ? 12 : isReal ? 9 : 7, 0, Math.PI * 2);
      ctx.strokeStyle = isSelected
        ? '#10b981'
        : isReal
        ? '#06b6d4'
        : isWhite
        ? '#404040'
        : '#10b981';
      ctx.lineWidth = isSelected ? 2.2 : isReal ? 1.8 : 1.2;
      ctx.stroke();

      // Blip Solid Center
      ctx.beginPath();
      ctx.arc(blipX, blipY, isSelected ? 5 : isReal ? 4 : 3.2, 0, Math.PI * 2);
      ctx.fillStyle = isSelected
        ? '#10b981'
        : isReal
        ? '#06b6d4'
        : isWhite
        ? '#000000'
        : '#10b981';
      ctx.fill();

      // Blip Label & Distance
      ctx.fillStyle = isSelected ? primaryInk : secondaryInk;
      ctx.font = isSelected
        ? 'bold 11px "JetBrains Mono", monospace'
        : '10px "JetBrains Mono", monospace';
      ctx.textAlign = 'left';

      const tag = isReal ? ' [BLE]' : '';
      ctx.fillText(`${dev.name}${tag} (${dev.distanceMeters}m)`, blipX + 11, blipY - 4);
    });

    // 7. Radar Center User Pin
    ctx.beginPath();
    ctx.arc(center.x, center.y, 4, 0, Math.PI * 2);
    ctx.fillStyle = '#10b981';
    ctx.fill();

    ctx.beginPath();
    ctx.arc(center.x, center.y, 8, 0, Math.PI * 2);
    ctx.strokeStyle = 'rgba(16, 185, 129, 0.4)';
    ctx.lineWidth = 1.5;
    ctx.stroke();
  };

  const handleCanvasClick = (e: React.MouseEvent<HTMLCanvasElement>) => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const rect = canvas.getBoundingClientRect();
    const clickX = ((e.clientX - rect.left) / rect.width) * canvas.width;
    const clickY = ((e.clientY - rect.top) / rect.height) * canvas.height;

    const center = { x: canvas.width / 2, y: canvas.height / 2 };
    const radius = Math.min(canvas.width, canvas.height) * 0.43;

    for (const dev of devices) {
      const devRad = (dev.angleDeg * Math.PI) / 180;
      const distPx = radius * (dev.distanceMeters / 10.0);
      const blipX = center.x + distPx * Math.cos(devRad);
      const blipY = center.y + distPx * Math.sin(devRad);

      if (Math.hypot(clickX - blipX, clickY - blipY) < 22) {
        setSelectedDevice(dev);
        jarvisAudio.playAcknowledgeSound();
        const speech = `Target locked: ${dev.name}, ${dev.distanceMeters} meters, RSSI ${dev.rssi} dBm. 30-second path highlighted.`;
        if (onSpeak) onSpeak(speech);
        else jarvisAudio.speak(speech);
        return;
      }
    }
  };

  const getDeviceIcon = (type: DeviceBlip['type']) => {
    switch (type) {
      case 'smartphone':
        return <Smartphone className="w-4 h-4 text-black dark:text-neutral-200" />;
      case 'laptop':
        return <Laptop className="w-4 h-4 text-black dark:text-neutral-200" />;
      case 'display':
        return <Tv className="w-4 h-4 text-black dark:text-neutral-200" />;
      case 'wearable':
        return <Watch className="w-4 h-4 text-emerald-600 dark:text-emerald-400" />;
      default:
        return <Bluetooth className="w-4 h-4 text-cyan-600 dark:text-cyan-400" />;
    }
  };

  // Selected device trail statistics over last 30s
  const selectedTrail = selectedDevice ? trailsRef.current.get(selectedDevice.id) || [] : [];
  const selectedTrailDistDelta =
    selectedTrail.length >= 2
      ? Math.abs(
          selectedTrail[selectedTrail.length - 1].distanceMeters - selectedTrail[0].distanceMeters
        ).toFixed(2)
      : '0.00';

  return (
    <div className="relative w-full h-full min-h-[520px] flex flex-col bg-white dark:bg-[#060606] rounded-2xl border border-neutral-300 dark:border-neutral-800 overflow-hidden text-black dark:text-white">
      {/* Top Header */}
      <div className="flex flex-wrap items-center justify-between px-4 py-3 border-b border-neutral-200 dark:border-neutral-800 bg-neutral-50 dark:bg-[#0a0a0a] z-10 gap-2.5">
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <h3 className="text-sm font-display font-bold text-black dark:text-white">
              10-Meter Bluetooth &amp; RF Radar
            </h3>
            <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-emerald-100 dark:bg-emerald-950/60 text-emerald-800 dark:text-emerald-300 border border-emerald-300 dark:border-emerald-800 font-semibold">
              {sectorBadge}
            </span>
          </div>
          <p className="text-xs text-neutral-600 dark:text-neutral-400">
            Voice trigger:{' '}
            <span className="font-mono text-black dark:text-neutral-200">
              "find the nearby device"
            </span>
          </p>
        </div>

        {/* Filter Tabs */}
        <div className="flex items-center bg-white dark:bg-black p-1 rounded-lg border border-neutral-300 dark:border-neutral-800 text-xs">
          {(
            [
              ['all', 'All'],
              ['bluetooth', 'Bluetooth'],
              ['wifi', 'WiFi'],
            ] as const
          ).map(([key, label]) => (
            <button
              key={key}
              onClick={() => setFilterType(key)}
              className={`px-3 py-1 rounded-md transition cursor-pointer ${
                filterType === key
                  ? 'bg-black text-white dark:bg-white dark:text-black font-semibold'
                  : 'text-neutral-600 hover:text-black dark:text-neutral-400 dark:hover:text-white'
              }`}
            >
              {label}
            </button>
          ))}
        </div>

        {/* Top Controls: 30s Trail Toggle + Bluetooth Pair + Audio Ping */}
        <div className="flex items-center gap-2 flex-wrap">
          {/* 30-Second Movement Trail Toggle */}
          <button
            type="button"
            onClick={() => setShowHistoryTrails((prev) => !prev)}
            className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg border text-xs font-mono transition cursor-pointer ${
              showHistoryTrails
                ? 'bg-emerald-500/10 border-emerald-500/40 text-emerald-700 dark:text-emerald-300 font-semibold'
                : 'bg-white dark:bg-black border-neutral-300 dark:border-neutral-800 text-neutral-500'
            }`}
            title="Toggle 30-second historical movement path on radar"
          >
            <History className="w-3.5 h-3.5" />
            <span>30s Trails: {showHistoryTrails ? 'ON' : 'OFF'}</span>
          </button>

          {/* Bluetooth Radio Hardware Status Badge */}
          <div
            className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg border text-xs font-mono transition ${
              isBluetoothRadioOn === true
                ? 'bg-emerald-500/10 border-emerald-500/30 text-emerald-600 dark:text-emerald-400 font-semibold'
                : isBluetoothRadioOn === false
                ? 'bg-rose-500/10 border-rose-500/30 text-rose-600 dark:text-rose-400 font-semibold'
                : 'bg-neutral-100 dark:bg-neutral-900 border-neutral-300 dark:border-neutral-800 text-neutral-400'
            }`}
            title={
              isBluetoothRadioOn === true
                ? 'Bluetooth adapter is ON and ready for pairing'
                : isBluetoothRadioOn === false
                ? 'Bluetooth adapter is TURNED OFF. Please turn on Bluetooth in device settings'
                : 'Checking Bluetooth adapter status...'
            }
          >
            <span
              className={`w-2 h-2 rounded-full ${
                isBluetoothRadioOn === true
                  ? 'bg-emerald-500 animate-pulse'
                  : isBluetoothRadioOn === false
                  ? 'bg-rose-500'
                  : 'bg-neutral-400'
              }`}
            />
            <span>BT: {isBluetoothRadioOn === true ? 'ON' : isBluetoothRadioOn === false ? 'OFF' : '...'}</span>
          </div>

          {/* Live IP & Network Configuration Button */}
          <button
            type="button"
            onClick={() => setShowIpModal(true)}
            className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg border border-neutral-300 dark:border-neutral-800 bg-white dark:bg-black hover:bg-neutral-100 dark:hover:bg-neutral-900 text-xs font-mono transition cursor-pointer"
            title="Inspect IP Configuration & Network Interfaces"
          >
            <Radio className="w-3.5 h-3.5 text-blue-500" />
            <span className="font-semibold text-neutral-800 dark:text-neutral-200">
              IP: {ipConfig?.clientIp || ipConfig?.localIp || '192.168.1.105'}
            </span>
          </button>

          {/* Connect Real Bluetooth Hardware Button (ONLY IF BLUETOOTH IS ON) */}
          <button
            type="button"
            onClick={connectRealBluetooth}
            disabled={isConnectingBle || isBluetoothRadioOn === false}
            className={`flex items-center gap-1.5 px-3 py-1.5 font-semibold rounded-lg text-xs transition cursor-pointer disabled:opacity-40 ${
              isBluetoothRadioOn === false
                ? 'bg-neutral-200 dark:bg-neutral-800 text-neutral-400 cursor-not-allowed'
                : 'bg-black text-white dark:bg-white dark:text-black hover:opacity-90'
            }`}
            title={
              isBluetoothRadioOn === false
                ? 'Bluetooth is turned OFF. Turn on Bluetooth in device settings to connect.'
                : 'Open browser Bluetooth chooser to pair real physical devices'
            }
          >
            <Bluetooth className="w-3.5 h-3.5 text-cyan-400 dark:text-cyan-600" />
            <span>{isConnectingBle ? 'Scanning BLE...' : 'Connect Bluetooth'}</span>
          </button>

          {/* Sonar Ping Button */}
          <button
            type="button"
            onClick={() => setAudioPingEnabled(!audioPingEnabled)}
            className={`p-1.5 rounded-lg border transition cursor-pointer ${
              audioPingEnabled
                ? 'bg-neutral-200 text-black border-neutral-400 dark:bg-[#181818] dark:text-white dark:border-neutral-700'
                : 'bg-white text-neutral-500 border-neutral-300 dark:bg-black dark:text-neutral-500 dark:border-neutral-800'
            }`}
            title={audioPingEnabled ? 'Sonar audio ping ON' : 'Sonar audio ping muted'}
          >
            {audioPingEnabled ? <Volume2 className="w-4 h-4" /> : <VolumeX className="w-4 h-4" />}
          </button>
        </div>
      </div>

      {/* Location / Sector Bar (Solves "always showing same device after changing locations") */}
      <div className="px-4 py-2 bg-neutral-100/70 dark:bg-[#0e0e0e] border-b border-neutral-200 dark:border-neutral-800/80 flex flex-wrap items-center justify-between gap-2 text-xs font-mono">
        <div className="flex items-center gap-2 min-w-0">
          <MapPin className="w-3.5 h-3.5 text-red-500 shrink-0" />
          <span className="font-semibold text-neutral-700 dark:text-neutral-300 shrink-0">
            Sector Environment:
          </span>
          <div className="flex items-center gap-1 flex-wrap">
            {(
              [
                ['office', 'Office / Lab'],
                ['home', 'Home Living'],
                ['cafe', 'Cafe & Retail'],
                ['transit', 'Transit Hub'],
                ['gps', 'Live GPS Sector'],
              ] as const
            ).map(([key, label]) => (
              <button
                key={key}
                type="button"
                onClick={() => switchSector(key)}
                className={`px-2 py-0.5 rounded text-[11px] transition cursor-pointer ${
                  activeSector === key
                    ? 'bg-black text-white dark:bg-white dark:text-black font-semibold shadow-xs'
                    : 'bg-white/80 dark:bg-black/60 text-neutral-600 dark:text-neutral-400 hover:text-black dark:hover:text-white border border-neutral-300/80 dark:border-neutral-800'
                }`}
              >
                {label}
              </button>
            ))}
          </div>
        </div>

        <button
          type="button"
          onClick={() => switchSector(activeSector)}
          className="inline-flex items-center gap-1 text-[11px] font-medium text-neutral-600 hover:text-black dark:text-neutral-400 dark:hover:text-white transition cursor-pointer"
          title="Rescan and regenerate nearby RF devices for this sector"
        >
          <RefreshCw className="w-3 h-3" />
          <span>Rescan Sector</span>
        </button>
      </div>

      {/* Bluetooth notice banner if available */}
      {bluetoothNotice && (
        <div className="px-4 py-1.5 bg-cyan-50 dark:bg-cyan-950/30 border-b border-cyan-200 dark:border-cyan-900/50 text-cyan-800 dark:text-cyan-300 text-xs flex items-center justify-between">
          <span className="truncate">{bluetoothNotice}</span>
          <button
            type="button"
            onClick={() => setBluetoothNotice(null)}
            className="text-cyan-600 hover:text-cyan-900 dark:hover:text-cyan-100 font-bold ml-2"
          >
            ×
          </button>
        </div>
      )}

      {/* Main Radar Canvas + Device Inspector */}
      <div className="relative flex-1 w-full grid grid-cols-1 lg:grid-cols-3 gap-4 p-4 bg-white dark:bg-black overflow-hidden">
        {/* Radar Canvas Stage */}
        <div className="relative lg:col-span-2 w-full h-[380px] lg:h-full flex items-center justify-center bg-white dark:bg-black rounded-xl border border-neutral-300 dark:border-neutral-800 overflow-hidden">
          <canvas
            ref={canvasRef}
            width={540}
            height={540}
            onClick={handleCanvasClick}
            className="w-full h-full max-w-[490px] max-h-[490px] object-contain cursor-pointer"
          />

          {/* Radar HUD Telemetry Overlay */}
          <div className="absolute top-3 left-3 p-2.5 rounded-lg bg-white/90 dark:bg-[#0a0a0a]/90 border border-neutral-300 dark:border-neutral-800 text-[11px] font-mono tabular-nums text-black dark:text-neutral-300 space-y-1 pointer-events-none shadow-sm backdrop-blur-xs">
            <div className="flex items-center gap-1.5 font-semibold text-black dark:text-white">
              <Radio className="w-3.5 h-3.5 text-emerald-600 dark:text-emerald-400" />
              <span>PERIMETER SCAN</span>
            </div>
            <div className="text-neutral-600 dark:text-neutral-400 flex items-center gap-1.5">
              <span>Azimuth: {Math.round(sweepAngle)}°</span>
              <span>·</span>
              <span className="text-emerald-600 dark:text-emerald-400">10m Max</span>
            </div>
            <div className="text-neutral-600 dark:text-neutral-400 flex items-center gap-1 text-[10px]">
              <Clock className="w-2.5 h-2.5 text-emerald-500" />
              <span>Movement Trail: 30s Window</span>
            </div>
            {currentCoords.lat !== undefined && (
              <div className="text-neutral-500 text-[10px] truncate max-w-[190px]">
                GPS: {currentCoords.lat.toFixed(4)}°, {currentCoords.lon?.toFixed(4)}°
              </div>
            )}
            {networkInfo.downlink !== undefined && (
              <div className="text-neutral-500 text-[10px] flex items-center gap-1">
                <Wifi className="w-2.5 h-2.5" />
                <span>
                  {networkInfo.downlink} Mbps · {networkInfo.rtt ?? 0}ms
                </span>
              </div>
            )}
          </div>

          {/* 30s Trail Legend Pill at bottom right */}
          {showHistoryTrails && (
            <div className="absolute bottom-3 right-3 px-2 py-1 rounded bg-black/80 dark:bg-white/90 text-white dark:text-black text-[10px] font-mono pointer-events-none flex items-center gap-1.5 shadow-sm">
              <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
              <span>30s Trajectory Trail Active</span>
            </div>
          )}
        </div>

        {/* Right Side: Selected Device Inspector & Device List */}
        <div className="w-full flex flex-col justify-between space-y-3.5 overflow-hidden">
          {selectedDevice ? (
            <div className="p-3.5 bg-neutral-50 dark:bg-[#0a0a0a] border border-neutral-300 dark:border-neutral-800 rounded-xl text-xs font-mono tabular-nums space-y-2.5">
              <div className="flex items-center justify-between border-b border-neutral-200 dark:border-neutral-800 pb-2">
                <div className="flex items-center gap-2 font-semibold text-black dark:text-white min-w-0">
                  {getDeviceIcon(selectedDevice.type)}
                  <span className="truncate">{selectedDevice.name}</span>
                </div>
                <div className="flex items-center gap-1.5 shrink-0">
                  {selectedDevice.isRealDevice && (
                    <span className="text-[10px] bg-cyan-500/20 text-cyan-700 dark:text-cyan-300 px-1.5 py-0.5 rounded font-bold uppercase">
                      Real BLE
                    </span>
                  )}
                  <span className="text-[10px] text-emerald-600 dark:text-emerald-400 uppercase font-semibold">
                    {selectedDevice.status}
                  </span>
                </div>
              </div>

              <div className="space-y-1 text-neutral-800 dark:text-neutral-300">
                <div className="flex justify-between">
                  <span className="text-neutral-500">Distance</span>
                  <span className="font-bold text-black dark:text-white">
                    {selectedDevice.distanceMeters} m
                  </span>
                </div>
                <div className="flex justify-between">
                  <span className="text-neutral-500">RSSI Signal</span>
                  <span className="text-emerald-600 dark:text-emerald-400 font-semibold">
                    {selectedDevice.rssi} dBm
                  </span>
                </div>
                <div className="flex justify-between">
                  <span className="text-neutral-500">Hardware MAC/ID</span>
                  <span className="text-neutral-600 dark:text-neutral-400 font-mono text-[11px]">
                    {selectedDevice.mac}
                  </span>
                </div>
                <div className="flex justify-between">
                  <span className="text-neutral-500">RF Protocol</span>
                  <span>{selectedDevice.frequency}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-neutral-500">Azimuth Angle</span>
                  <span>{selectedDevice.angleDeg}°</span>
                </div>
                {selectedDevice.batteryLevel !== undefined && (
                  <div className="flex justify-between items-center">
                    <span className="text-neutral-500 flex items-center gap-1">
                      <Battery className="w-3 h-3 text-emerald-500" />
                      <span>Battery Level</span>
                    </span>
                    <span className="text-emerald-600 dark:text-emerald-400 font-semibold">
                      {selectedDevice.batteryLevel}%
                    </span>
                  </div>
                )}
                <div className="flex justify-between pt-1 border-t border-neutral-200 dark:border-neutral-900 text-[11px]">
                  <span className="text-neutral-500 flex items-center gap-1">
                    <Footprints className="w-3 h-3 text-emerald-500" />
                    <span>30s Delta Move</span>
                  </span>
                  <span className="font-semibold text-emerald-600 dark:text-emerald-400">
                    {selectedTrailDistDelta} m
                  </span>
                </div>
              </div>

              {/* Signal Integrity Bar */}
              <div className="space-y-1 pt-1 border-t border-neutral-200 dark:border-neutral-900">
                <div className="flex justify-between text-[10px] text-neutral-500">
                  <span>Signal Quality</span>
                  <span>
                    {Math.round(Math.max(0, 100 - (selectedDevice.distanceMeters / 10) * 100))}%
                  </span>
                </div>
                <div className="w-full h-1.5 bg-neutral-200 dark:bg-neutral-900 rounded-full overflow-hidden">
                  <div
                    style={{
                      width: `${Math.max(
                        10,
                        100 - (selectedDevice.distanceMeters / 10) * 100
                      )}%`,
                    }}
                    className="h-full bg-emerald-500 dark:bg-emerald-400 rounded-full transition-all"
                  />
                </div>
              </div>

              {/* Action Buttons */}
              <div className="grid grid-cols-2 gap-2 pt-1">
                <button
                  type="button"
                  onClick={() => {
                    jarvisAudio.playRadarPing(0.25);
                    const msg = `Pinging ${selectedDevice.name}. Range locked at ${selectedDevice.distanceMeters} meters. 30-second trajectory active.`;
                    if (onSpeak) onSpeak(msg);
                    else jarvisAudio.speak(msg);
                  }}
                  className="w-full py-1.5 bg-black text-white dark:bg-[#161616] dark:hover:bg-neutral-800 border border-black dark:border-neutral-700 font-semibold rounded-lg transition text-center cursor-pointer text-xs"
                >
                  Ping Blip
                </button>
                {selectedDevice.isRealDevice && (
                  <button
                    type="button"
                    onClick={() => disconnectRealDevice(selectedDevice.id)}
                    className="w-full py-1.5 bg-red-50 text-red-700 hover:bg-red-100 dark:bg-red-950/20 dark:text-red-300 dark:hover:bg-red-950/40 border border-red-200 dark:border-red-900/40 font-semibold rounded-lg transition text-center cursor-pointer text-xs flex items-center justify-center gap-1"
                  >
                    <Unlink className="w-3 h-3" />
                    <span>Unpair</span>
                  </button>
                )}
              </div>
            </div>
          ) : null}

          {/* List of Detected Devices in Current Sector */}
          <div className="flex-1 bg-neutral-50 dark:bg-[#0a0a0a] border border-neutral-300 dark:border-neutral-800 rounded-xl p-3 flex flex-col text-xs font-mono tabular-nums space-y-2 max-h-[220px] overflow-y-auto">
            <div className="flex items-center justify-between text-neutral-600 dark:text-neutral-400 font-semibold border-b border-neutral-200 dark:border-neutral-800 pb-1.5">
              <span className="flex items-center gap-1.5">
                <span>SECTOR TARGETS ({devices.length})</span>
              </span>
              <span className="text-[10px] text-neutral-500">≤ {maxFilterDistance}m</span>
            </div>

            <div className="space-y-1">
              {devices
                .filter((d) => d.distanceMeters <= maxFilterDistance)
                .map((dev) => (
                  <button
                    key={dev.id}
                    type="button"
                    onClick={() => {
                      setSelectedDevice(dev);
                      jarvisAudio.playAcknowledgeSound();
                    }}
                    className={`w-full flex items-center justify-between p-2 rounded-lg text-left transition cursor-pointer ${
                      selectedDevice?.id === dev.id
                        ? 'bg-neutral-200 dark:bg-neutral-900 border border-neutral-400 dark:border-neutral-700 text-black dark:text-white shadow-xs'
                        : 'bg-white hover:bg-neutral-100 dark:bg-black dark:hover:bg-[#121212] text-neutral-800 dark:text-neutral-300 border border-transparent'
                    }`}
                  >
                    <div className="flex items-center gap-2 truncate">
                      {getDeviceIcon(dev.type)}
                      <span className="truncate">
                        {dev.name}
                        {dev.isRealDevice && (
                          <span className="ml-1 text-[9px] font-bold text-cyan-600 dark:text-cyan-400">
                            [BLE]
                          </span>
                        )}
                      </span>
                    </div>
                    <div className="flex items-center gap-2 text-right shrink-0">
                      <span className="font-semibold text-black dark:text-white">
                        {dev.distanceMeters}m
                      </span>
                      <span className="text-[10px] text-neutral-500">{dev.rssi}dBm</span>
                    </div>
                  </button>
                ))}
            </div>
          </div>
        </div>
      </div>

      {/* Bottom Footer Info Bar */}
      <div className="flex items-center justify-between px-4 py-2 bg-neutral-50 dark:bg-[#0a0a0a] border-t border-neutral-200 dark:border-neutral-800 text-xs text-neutral-600 dark:text-neutral-500 font-mono">
        <span className="flex items-center gap-1.5 text-black dark:text-neutral-300">
          <Compass className="w-3.5 h-3.5 text-emerald-500" />
          <span>360° Polar Proximity · 30-Second Movement Vector Tracking</span>
        </span>
        <span className="flex items-center gap-2">
          {isBluetoothSupported && (
            <span className="text-cyan-600 dark:text-cyan-400 font-medium">
              Web Bluetooth Ready
            </span>
          )}
          <span>·</span>
          <span>BLE 5.3 · WiFi 6</span>
        </span>
      </div>

      {/* Live IP & Network Configuration HUD Modal */}
      {showIpModal && (
        <div className="fixed inset-0 bg-black/80 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-white dark:bg-[#0a0a0a] border border-neutral-300 dark:border-neutral-800 rounded-2xl p-6 max-w-md w-full shadow-2xl text-black dark:text-white font-mono space-y-4">
            <div className="flex items-center justify-between pb-3 border-b border-neutral-200 dark:border-neutral-800">
              <div className="flex items-center gap-2">
                <Radio className="w-4 h-4 text-emerald-500" />
                <h4 className="text-sm font-bold uppercase tracking-wider">
                  Radar IP &amp; Network Configuration
                </h4>
              </div>
              <button
                onClick={() => setShowIpModal(false)}
                className="text-neutral-400 hover:text-black dark:hover:text-white cursor-pointer"
              >
                ✕
              </button>
            </div>

            <div className="space-y-2 text-xs">
              <div className="flex justify-between py-1 border-b border-neutral-100 dark:border-neutral-900">
                <span className="text-neutral-500">Public Client IP:</span>
                <span className="font-semibold text-emerald-500">{ipConfig?.clientIp || '127.0.0.1'}</span>
              </div>
              <div className="flex justify-between py-1 border-b border-neutral-100 dark:border-neutral-900">
                <span className="text-neutral-500">Local Subnet IPv4:</span>
                <span className="font-semibold">{ipConfig?.localIp || '192.168.1.105'}</span>
              </div>
              <div className="flex justify-between py-1 border-b border-neutral-100 dark:border-neutral-900">
                <span className="text-neutral-500">Subnet Mask:</span>
                <span>{ipConfig?.netmask || '255.255.255.0'}</span>
              </div>
              <div className="flex justify-between py-1 border-b border-neutral-100 dark:border-neutral-900">
                <span className="text-neutral-500">Default Gateway:</span>
                <span>{ipConfig?.gateway || '192.168.1.1'}</span>
              </div>
              <div className="flex justify-between py-1 border-b border-neutral-100 dark:border-neutral-900">
                <span className="text-neutral-500">MAC / Interface ID:</span>
                <span>{ipConfig?.mac || 'F0:2F:74:9C:12:44'}</span>
              </div>
              <div className="flex justify-between py-1 border-b border-neutral-100 dark:border-neutral-900">
                <span className="text-neutral-500">DNS Resolvers:</span>
                <span>{(ipConfig?.dns || ['8.8.8.8', '1.1.1.1']).join(', ')}</span>
              </div>
              <div className="flex justify-between py-1 border-b border-neutral-100 dark:border-neutral-900">
                <span className="text-neutral-500">Network Latency (RTT):</span>
                <span>{networkInfo.rtt ? `${networkInfo.rtt} ms` : '16 ms'}</span>
              </div>
              <div className="flex justify-between py-1">
                <span className="text-neutral-500">Downlink Bandwidth:</span>
                <span>{networkInfo.downlink ? `${networkInfo.downlink} Mbps` : '100 Mbps'}</span>
              </div>
            </div>

            <div className="pt-2 flex justify-end">
              <button
                onClick={() => setShowIpModal(false)}
                className="px-4 py-1.5 rounded-lg bg-black text-white dark:bg-white dark:text-black text-xs font-semibold hover:opacity-90 cursor-pointer"
              >
                Close HUD
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
