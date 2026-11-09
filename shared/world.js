// Map layout of Maple City (pixels). Top-down, GTA-1/2 style.
// Roads form a grid; each block holds buildings with a door facing a road.

export const WORLD = { width: 2400, height: 1900, roadWidth: 96 };

export const ROADS = [
  // horizontal
  { x: 0, y: 300, w: 2400, h: 96 },
  { x: 0, y: 900, w: 2400, h: 96 },
  { x: 0, y: 1500, w: 2400, h: 96 },
  // vertical
  { x: 300, y: 0, w: 96, h: 1900 },
  { x: 1000, y: 0, w: 96, h: 1900 },
  { x: 1700, y: 0, w: 96, h: 1900 }
];

// door: point where the player must stand to interact (just outside the building)
export const LOCATIONS = [
  { id: 'airport', name: 'Maple City International Airport', short: 'Airport', icon: '✈️', color: 0x8fa3b8, roof: 0x5d7085,
    x: 20, y: 420, w: 260, h: 460, door: { x: 292, y: 650 } },
  { id: 'phone_store', name: 'PhoneHub', short: 'Phone store', icon: '📱', color: 0x6c5ce7, roof: 0x4834d4,
    x: 440, y: 60, w: 200, h: 200, door: { x: 540, y: 278 } },
  { id: 'hotel', name: 'Hotel Sunrise', short: 'Hotel', icon: '🏨', color: 0xe17055, roof: 0xb44a32,
    x: 440, y: 440, w: 220, h: 200, door: { x: 550, y: 422 } },
  { id: 'apartment', name: 'Oak Street Apartments', short: 'Apartments', icon: '🏢', color: 0xb08968, roof: 0x7f5539,
    x: 720, y: 440, w: 240, h: 200, door: { x: 840, y: 422 } },
  { id: 'bakery', name: 'Sweet Crumbs Bakery', short: 'Bakery', icon: '🥐', color: 0xfdcb6e, roof: 0xe1a32b,
    x: 440, y: 700, w: 180, h: 160, door: { x: 530, y: 878 } },
  { id: 'barber', name: 'Sharp Cuts Barbershop', short: 'Barbershop', icon: '💈', color: 0x74b9ff, roof: 0x0984e3,
    x: 680, y: 700, w: 160, h: 160, door: { x: 760, y: 878 } },
  { id: 'grocery', name: 'FreshMart Groceries', short: 'Grocery store', icon: '🛒', color: 0x55efc4, roof: 0x00b894,
    x: 1140, y: 440, w: 300, h: 220, door: { x: 1290, y: 422 } },
  { id: 'cafe', name: 'Corner Café', short: 'Café', icon: '☕', color: 0xd4a373, roof: 0x9c6644,
    x: 1480, y: 440, w: 180, h: 180, door: { x: 1570, y: 422 } },
  { id: 'bank', name: 'First National Bank', short: 'Bank', icon: '🏦', color: 0xdfe6e9, roof: 0x95a5a6,
    x: 1140, y: 720, w: 220, h: 150, door: { x: 1250, y: 882 } },
  { id: 'clinic', name: 'Maple City Clinic', short: 'Clinic', icon: '🏥', color: 0xffffff, roof: 0xd63031,
    x: 1400, y: 720, w: 260, h: 150, door: { x: 1530, y: 882 } },
  { id: 'job_center', name: 'Maple City Job Center', short: 'Job center', icon: '💼', color: 0xa29bfe, roof: 0x6c5ce7,
    x: 1140, y: 1040, w: 260, h: 200, door: { x: 1270, y: 1018 } },
  { id: 'diner', name: "Mama's Diner", short: 'Diner', icon: '🍔', color: 0xff7675, roof: 0xd63031,
    x: 1440, y: 1040, w: 220, h: 180, door: { x: 1550, y: 1018 } },
  { id: 'offices', name: 'Downtown Offices', short: 'Offices', icon: '🏙️', color: 0x636e72, roof: 0x2d3436,
    x: 1840, y: 440, w: 300, h: 400, door: { x: 1818, y: 640 } }
];

export const PARK = { id: 'park', name: 'Central Park', x: 440, y: 1040, w: 520, h: 420 };

// Decorative buildings (no door)
export const DECOR = [
  { x: 40, y: 40, w: 220, h: 220 }, { x: 700, y: 60, w: 260, h: 200 }, { x: 1140, y: 60, w: 520, h: 200 },
  { x: 1840, y: 60, w: 520, h: 200 }, { x: 2180, y: 440, w: 180, h: 400 }, { x: 40, y: 1040, w: 220, h: 420 },
  { x: 1840, y: 1040, w: 240, h: 200 }, { x: 2120, y: 1040, w: 240, h: 420 }, { x: 1140, y: 1280, w: 520, h: 180 },
  { x: 1840, y: 1280, w: 240, h: 180 }, { x: 40, y: 1640, w: 220, h: 220 }, { x: 440, y: 1640, w: 520, h: 220 },
  { x: 1140, y: 1640, w: 520, h: 220 }, { x: 1840, y: 1640, w: 520, h: 220 }
];

export const SPAWN = { x: 330, y: 700 };
export const TAXI_STAND = { x: 345, y: 600 };

export function locationById(id) {
  return LOCATIONS.find(l => l.id === id);
}
