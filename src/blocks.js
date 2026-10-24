// Definición de bloques y sus texturas.

export const B = {
  AIR: 0,
  GRASS: 1,
  DIRT: 2,
  STONE: 3,
  SAND: 4,
  WATER: 5,
  LOG: 6,
  LEAVES: 7,
  PLANKS: 8,
  COBBLE: 9,
  GLASS: 10,
  BEDROCK: 11,
  SNOW: 12,
  BRICK: 13,
  COAL_ORE: 14,
  IRON_ORE: 15,
};

// Índices de las casillas del atlas de texturas.
export const T = {
  GRASS_TOP: 0,
  GRASS_SIDE: 1,
  DIRT: 2,
  STONE: 3,
  SAND: 4,
  WATER: 5,
  LOG_SIDE: 6,
  LOG_TOP: 7,
  LEAVES: 8,
  PLANKS: 9,
  COBBLE: 10,
  GLASS: 11,
  BEDROCK: 12,
  SNOW: 13,
  SNOW_SIDE: 14,
  BRICK: 15,
  COAL_ORE: 16,
  IRON_ORE: 17,
};

export const KIND_AIR = 0;
export const KIND_OPAQUE = 1;
export const KIND_CUTOUT = 2; // hojas, cristal: píxeles transparentes
export const KIND_LIQUID = 3;

export const BLOCKS = [];
export const KIND = new Uint8Array(256);
export const SOLID = new Uint8Array(256);
export const OCCLUDES = new Uint8Array(256); // proyecta oclusión ambiental
export const TEX_TOP = new Uint8Array(256);
export const TEX_SIDE = new Uint8Array(256);
export const TEX_BOTTOM = new Uint8Array(256);

function def(id, name, [top, side, bottom], kind = KIND_OPAQUE) {
  BLOCKS[id] = { id, name };
  KIND[id] = kind;
  SOLID[id] = kind === KIND_OPAQUE || kind === KIND_CUTOUT ? 1 : 0;
  OCCLUDES[id] = kind === KIND_OPAQUE || id === B.LEAVES ? 1 : 0;
  TEX_TOP[id] = top;
  TEX_SIDE[id] = side;
  TEX_BOTTOM[id] = bottom;
}

def(B.AIR, 'Aire', [0, 0, 0], KIND_AIR);
def(B.GRASS, 'Bloque de césped', [T.GRASS_TOP, T.GRASS_SIDE, T.DIRT]);
def(B.DIRT, 'Tierra', [T.DIRT, T.DIRT, T.DIRT]);
def(B.STONE, 'Piedra', [T.STONE, T.STONE, T.STONE]);
def(B.SAND, 'Arena', [T.SAND, T.SAND, T.SAND]);
def(B.WATER, 'Agua', [T.WATER, T.WATER, T.WATER], KIND_LIQUID);
def(B.LOG, 'Tronco de roble', [T.LOG_TOP, T.LOG_SIDE, T.LOG_TOP]);
def(B.LEAVES, 'Hojas de roble', [T.LEAVES, T.LEAVES, T.LEAVES], KIND_CUTOUT);
def(B.PLANKS, 'Tablones de roble', [T.PLANKS, T.PLANKS, T.PLANKS]);
def(B.COBBLE, 'Piedra labrada', [T.COBBLE, T.COBBLE, T.COBBLE]);
def(B.GLASS, 'Cristal', [T.GLASS, T.GLASS, T.GLASS], KIND_CUTOUT);
def(B.BEDROCK, 'Roca madre', [T.BEDROCK, T.BEDROCK, T.BEDROCK]);
def(B.SNOW, 'Nieve', [T.SNOW, T.SNOW_SIDE, T.DIRT]);
def(B.BRICK, 'Ladrillos', [T.BRICK, T.BRICK, T.BRICK]);
def(B.COAL_ORE, 'Mena de carbón', [T.COAL_ORE, T.COAL_ORE, T.COAL_ORE]);
def(B.IRON_ORE, 'Mena de hierro', [T.IRON_ORE, T.IRON_ORE, T.IRON_ORE]);

// Bloques que aparecen en el inventario.
export const PLACEABLE = Object.values(B).filter((id) => id !== B.AIR);
