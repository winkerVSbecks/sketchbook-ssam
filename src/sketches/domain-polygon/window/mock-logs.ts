import Random from 'canvas-sketch-util/random';

// Common file extensions
const extensions = [
  '.js',
  '.ts',
  '.jsx',
  '.tsx',
  '.json',
  '.glsl',
  '.vert',
  '.frag',
  '.obj',
];

// Domain types that reflect your actual implementation
const domainTypes = [
  'default',
  'full-span',
  'island',
  'combined',
  'small',
  'adjacent',
  'rectangular',
  'single-cell',
  'multi-cell',
];

// Polygon types
const polygonTypes = [
  'triangle',
  'rectangle',
  'pentagon',
  'hexagon',
  'octagon',
  'polygon',
  'mesh',
  'spline',
  'curve',
  'bezier',
  'quadratic',
  'nurbs',
];

// UI element types
const uiElements = [
  'button',
  'slider',
  'toggle',
  'dropdown',
  'panel',
  'card',
  'dialog',
  'tooltip',
  'menu',
  'drawer',
  'tab',
  'input',
  'form',
  'chart',
  'graph',
  'control',
  'overlay',
  'canvas',
];

// Grid cell types
const gridCellTypes = [
  'square',
  'hex',
  'triangular',
  'isometric',
  'perspective',
  'orthographic',
  'axonometric',
  'diamond',
  'offset',
  'staggered',
];

// Common measurement units
const units = ['px', 'em', 'rem', '%', 'vw', 'vh', 'vmin', 'deg', 'rad'];

// Grid dimensions commonly used
const gridSizes = [
  '8x8',
  '16x16',
  '32x32',
  '64x64',
  '100x100',
  '128x128',
  '256x256',
  '512x512',
  '1024x1024',
  '60x40',
  '120x80',
];

// Operations based on your actual implementation
const operations = [
  'generateDomainSystem',
  'generateRegions',
  'combineSmallRegions',
  'generatePolygon',
  'isNeighbour',
  'hasSmall',
  'isIsland',
  'PolyBool.intersect',
  'selectDomains',
  'createPolygonParts',
  'retrying',
  'mergeRegions',
  'findSuitableNeighbours',
  'markGridOccupancy',
  'calculateInsets',
];

// Rendering modes
const renderModes = [
  'wireframe',
  'solid',
  'shaded',
  'textured',
  'outline',
  'normal',
  'depth',
  'occlusion',
  'shadow',
  'ambient',
  'reflective',
];

// Generate random coordinates
const generateCoords = (): string => {
  const x = Random.rangeFloor(-1000, 1001) / 10;
  const y = Random.rangeFloor(-1000, 1001) / 10;
  const z = Random.chance(0.3) ? Random.rangeFloor(-1000, 1001) / 10 : null;

  return z !== null
    ? `(${x.toFixed(1)}, ${y.toFixed(1)}, ${z.toFixed(1)})`
    : `(${x.toFixed(1)}, ${y.toFixed(1)})`;
};

/**
 * Generates realistic mock logs for a grid/domain/polygon generation system
 */
export function generateGridSystemLogs({
  logCount = 20,
  showErrors = true,
  showWarnings = true,
  phase = 'random',
  includeTimestamps = true,
  includeLogLevels = true,
  verbosity = 'mixed',
}: {
  logCount?: number;
  showErrors?: boolean;
  showWarnings?: boolean;
  phase?:
    | 'grid'
    | 'domain'
    | 'polygon'
    | 'polygonParts'
    | 'ui'
    | 'render'
    | 'random';
  includeTimestamps?: boolean;
  includeLogLevels?: boolean;
  verbosity?: 'terse' | 'verbose' | 'mixed';
} = {}): string[] {
  // Choose a random phase if 'random' is specified
  const systemPhase =
    phase === 'random'
      ? Random.pick([
          'grid',
          'domain',
          'polygon',
          'polygonParts',
          'ui',
          'render',
        ])
      : phase;

  // Log formatting helpers
  const generateTimestamp = (): string => {
    if (!includeTimestamps) return '';

    const now = new Date();

    // Choose between different timestamp formats for variation
    if (Random.chance(0.3)) {
      // ISO format
      return `[${now.toISOString()}] `;
    } else if (Random.chance(0.5)) {
      // Simple time format
      return `[${now.getHours().toString().padStart(2, '0')}:${now
        .getMinutes()
        .toString()
        .padStart(2, '0')}:${now.getSeconds().toString().padStart(2, '0')}.${now
        .getMilliseconds()
        .toString()
        .padStart(3, '0')}] `;
    } else {
      // Compact format
      return `[${now.getHours().toString().padStart(2, '0')}:${now
        .getMinutes()
        .toString()
        .padStart(2, '0')}:${now.getSeconds().toString().padStart(2, '0')}] `;
    }
  };

  const generateLogLevel = (
    type: 'info' | 'debug' | 'verbose' | 'trace' | 'error' | 'warn' = 'info'
  ): string => {
    if (!includeLogLevels) return '';

    const levelMap: Record<string, string> = {
      info: 'INFO',
      debug: 'DEBUG',
      verbose: 'VERBOSE',
      trace: 'TRACE',
      error: 'ERROR',
      warn: 'WARN',
    };

    // Different formatting styles for log levels
    if (Random.chance(0.4)) {
      return `${levelMap[type]} `;
    } else if (Random.chance(0.5)) {
      return `[${levelMap[type]}] `;
    } else {
      return `${levelMap[type].toLowerCase()}: `;
    }
  };

  // Format a final log message
  const formatLog = (
    message: string,
    type: 'info' | 'debug' | 'verbose' | 'trace' | 'error' | 'warn' = 'info'
  ): string => {
    return `${generateTimestamp()}${generateLogLevel(type)}${message}`;
  };

  // Generate a data dump for occasional detailed logs
  const generateDataDump = (
    dataType: 'domain' | 'grid' | 'region' | 'polygon'
  ): string => {
    if (dataType === 'domain') {
      const id = Random.rangeFloor(0, 10);
      const x = Random.rangeFloor(0, 1000);
      const y = Random.rangeFloor(0, 1000);
      const width = Random.rangeFloor(50, 500);
      const height = Random.rangeFloor(50, 500);
      const type = Random.pick(['default', 'full-span']);
      const selected = Random.chance(0.7);

      return `{
  id: ${id},
  x: ${x},
  y: ${y},
  width: ${width},
  height: ${height},
  type: "${type}",
  selected: ${selected},
  hasPart: ${Random.chance(0.6)}
}`;
    } else if (dataType === 'region') {
      const id = Random.rangeFloor(0, 10);
      const x = Random.rangeFloor(0, 5);
      const y = Random.rangeFloor(0, 5);
      const width = Random.rangeFloor(1, 3);
      const height = Random.rangeFloor(1, 3);

      return `{
  id: ${id},
  x: ${x},
  y: ${y},
  width: ${width},
  height: ${height}
}`;
    } else if (dataType === 'polygon') {
      const points = Random.rangeFloor(5, 12);
      const coords = Array.from(
        { length: points },
        () => `[${Random.rangeFloor(0, 1000)}, ${Random.rangeFloor(0, 1000)}]`
      );

      return `[${coords.join(', ')}]`;
    } else {
      const rows = Random.rangeFloor(2, 6);
      const cols = Random.rangeFloor(2, 6);
      return `Grid [${rows}x${cols}], ${rows * cols} cells`;
    }
  };

  // Generate a random file path
  const generateFilePath = (): string => {
    const folders = [
      'src',
      'lib',
      'models',
      'geometries',
      'utils',
      'components',
      'systems',
    ];
    const fileNames = [
      'Grid',
      'Domain',
      'Polygon',
      'Mesh',
      'Geometry',
      'Shape',
      'Renderer',
      'Processor',
      'Generator',
      'Factory',
      'Builder',
      'Manager',
      'Controller',
    ];

    const folder = Random.pick(folders);
    const name = Random.pick(fileNames);
    const suffix = Random.chance(0.4)
      ? Random.pick(['Utils', 'Helper', 'System', 'Factory'])
      : '';
    const ext = Random.pick(extensions);

    return `${folder}/${name}${suffix}${ext}`;
  };

  // Generate a random error message specific to your system
  const generateError = (): string => {
    const errors = [
      `Failed to generate a domain system after 10 attempts`,
      `No suitable neighbours found for region`,
      `Invalid polygon: self-intersection detected`,
      `Cannot find region with ID in grid`,
      `PolyBool.intersect operation failed`,
      `Domain rectangle has negative dimensions`,
      `Attempt to combine incompatible regions`,
      `Invalid grid dimensions: [${Random.rangeFloor(
        0,
        3
      )}, ${Random.rangeFloor(0, 3)}]`,
      `Failed to generate polygon from selected domains`,
      `Cannot create part for domain with no intersection`,
      `Domain generation failed: not enough cells available`,
      `Invalid rectangle coordinates for domain`,
      `Polygon generation failed: invalid domain selection`,
      `Empty area after PolyBool.intersect operation`,
      `Gap scale must be between 0 and 1, got ${Random.range(1.01, 10).toFixed(
        2
      )}`,
    ];

    return Random.pick(errors);
  };

  // Generate a random warning message specific to your system
  const generateWarning = (): string => {
    const warnings = [
      `Small region with ID ${Random.rangeFloor(0, 10)} could not be combined`,
      `Grid dimensions [${Random.rangeFloor(2, 5)}, ${Random.rangeFloor(
        2,
        5
      )}] may produce simple layouts`,
      `No full-span domains found, all domains are of default type`,
      `Only ${Random.rangeFloor(1, 4)} domains have intersection with polygon`,
      `Gap scale ${Random.range(0.09, 0.2).toFixed(
        2
      )} may result in disconnected regions`,
      `Retrying domain generation (attempt ${Random.rangeFloor(1, 10)})`,
      `Polygon has complex shape that may impact intersection performance`,
      `Domain with ID ${Random.rangeFloor(0, 10)} has very small dimensions`,
      `Using fallback method for region generation`,
      `Multiple domains competing for the same grid cells`,
      `Low resolution prevents creation of more than ${Random.rangeFloor(
        2,
        5
      )} regions`,
      `Domain system using default values due to invalid parameters`,
      `Island detection may be affected by domain positioning`,
      `Polygon has narrow segments that may cause clipping issues`,
    ];

    return Random.pick(warnings);
  };

  // Generate a parameter description
  const generateParameter = (): string => {
    const parameterTypes = [
      `cellSize: ${Random.range(0.1, 10).toFixed(2)}${Random.pick(units)}`,
      `gridDimensions: ${Random.pick(gridSizes)}`,
      `cellType: "${Random.pick(gridCellTypes)}"`,
      `domainType: "${Random.pick(domainTypes)}"`,
      `polygonType: "${Random.pick(polygonTypes)}"`,
      `vertexCount: ${Random.rangeFloor(3, 100)}`,
      `subdivisionLevel: ${Random.rangeFloor(0, 6)}`,
      `tolerance: ${Random.range(0.001, 0.1).toFixed(4)}`,
      `iterations: ${Random.rangeFloor(1, 20)}`,
      `seed: ${Random.rangeFloor(1, 10000)}`,
      `resolution: ${Random.rangeFloor(16, 512)}`,
      `boundingBox: [${Random.rangeFloor(-100, 0)}, ${Random.rangeFloor(
        -100,
        0
      )}, ${Random.rangeFloor(1, 200)}, ${Random.rangeFloor(1, 200)}]`,
      `renderMode: "${Random.pick(renderModes)}"`,
      `wireframeWidth: ${Random.range(0.5, 3).toFixed(1)}`,
      `opacity: ${Random.range(0, 1).toFixed(2)}`,
    ];

    return Random.pick(parameterTypes);
  };

  // Generate a time measurement
  const generateTime = (): string => {
    if (Random.chance(0.3)) {
      // Milliseconds
      return `${Random.rangeFloor(1, 1000)}ms`;
    } else if (Random.chance(0.5)) {
      // Under a second with decimals
      return `${Random.range(0.001, 0.999).toFixed(3)}s`;
    } else {
      // Multiple seconds
      return `${Random.range(1, 10).toFixed(2)}s`;
    }
  };

  // Generate count information
  const generateCount = (type: string): string => {
    switch (type) {
      case 'grid':
        return `${Random.rangeFloor(100, 10000)} cells`;
      case 'domain':
        return `${Random.rangeFloor(1, 50)} domains`;
      case 'polygon':
        return `${Random.rangeFloor(1, 200)} polygons`;
      case 'vertex':
        return `${Random.rangeFloor(3, 5000)} vertices`;
      case 'edge':
        return `${Random.rangeFloor(3, 10000)} edges`;
      case 'face':
        return `${Random.rangeFloor(1, 5000)} faces`;
      case 'triangles':
        return `${Random.rangeFloor(2, 20000)} triangles`;
      case 'ui':
        return `${Random.rangeFloor(1, 50)} UI elements`;
      default:
        return `${Random.rangeFloor(1, 1000)} items`;
    }
  };

  // Generate a UUID-like identifier
  const generateId = (): string => {
    const generateHex = (length: number): string => {
      let result = '';
      for (let i = 0; i < length; i++) {
        result += Random.pick('0123456789abcdef');
      }
      return result;
    };

    return `${generateHex(8)}-${generateHex(4)}-${generateHex(4)}-${generateHex(
      4
    )}-${generateHex(12)}`;
  };

  // Generate an operation result
  const generateOperationResult = (operation: string): string => {
    const successes = [
      `${operation} completed successfully`,
      `${operation} operation applied to ${generateCount(
        Random.pick([
          'grid',
          'domain',
          'polygon',
          'vertex',
          'edge',
          'face',
          'triangles',
        ])
      )}`,
      `${operation} finished in ${generateTime()}`,
      `${operation} result: ${Random.rangeFloor(1, 100)} affected objects`,
    ];

    return Random.pick(successes);
  };

  // Log generators for each phase of the system
  const logGenerators: Record<string, () => string[]> = {
    grid: () => {
      const logs: string[] = [];

      // Initial setup
      const rows = Random.rangeFloor(2, 10);
      const cols = Random.rangeFloor(2, 10);
      logs.push(formatLog(`Initializing grid [${cols}x${rows}]`));

      const width = Random.rangeFloor(500, 2000);
      const height = Random.rangeFloor(500, 2000);

      // Different log formats for variation
      if (Random.chance(0.3)) {
        logs.push(formatLog(`Canvas size set to ${width}x${height}`, 'debug'));
      } else if (Random.chance(0.5)) {
        logs.push(
          formatLog(`Canvas dimensions: width=${width}, height=${height}`)
        );
      } else {
        logs.push(formatLog(`Setting up ${width}x${height} canvas`));
      }

      // Cell creation logs
      const gapScale = Random.range(0.01, 0.1).toFixed(2);

      // Vary the log style
      if (
        verbosity === 'verbose' ||
        (verbosity === 'mixed' && Random.chance(0.7))
      ) {
        logs.push(
          formatLog(
            `Gap scale: ${gapScale} (controls space between cells)`,
            'debug'
          )
        );
      } else {
        logs.push(formatLog(`Gap scale: ${gapScale}`));
      }

      const totalCells = rows * cols;

      // Technical loggers style sometimes
      if (Random.chance(0.3)) {
        logs.push(
          formatLog(
            `GridSystem.init() -> creating ${rows}×${cols} grid (${totalCells} cells)`,
            'debug'
          )
        );
      } else {
        logs.push(formatLog(`Creating grid with ${totalCells} total cells`));
      }

      // More technical details sometimes
      if (
        verbosity === 'verbose' ||
        (verbosity === 'mixed' && Random.chance(0.6))
      ) {
        logs.push(formatLog(`Calculating cell dimensions...`, 'verbose'));
        const cellWidth = Random.range(20, 100).toFixed(1);
        const cellHeight = Random.range(20, 100).toFixed(1);
        logs.push(formatLog(`Cell size: ${cellWidth}x${cellHeight}`));
        logs.push(formatLog(`Initializing empty grid array...`, 'trace'));
      } else if (Random.chance(0.5)) {
        logs.push(formatLog(`Grid cell size computed`, 'info'));
      }

      // Sometimes add a data dump
      if (
        Random.chance(0.3) &&
        (verbosity === 'verbose' || verbosity === 'mixed')
      ) {
        logs.push(formatLog(`Grid data: ${generateDataDump('grid')}`, 'debug'));
      }

      // Different completion messages
      if (logs.length < logCount - 1) {
        if (Random.chance(0.3)) {
          logs.push(
            formatLog(
              `Grid initialization complete in ${Random.range(1, 100).toFixed(
                2
              )}ms`
            )
          );
        } else if (Random.chance(0.5)) {
          logs.push(formatLog(`✓ Grid ready`));
        } else {
          logs.push(
            formatLog(`Grid system initialized with ${totalCells} cells`)
          );
        }
      }

      // Errors/warnings with variation
      if (showErrors && Random.chance(0.3) && logs.length < logCount) {
        const errorMessages = [
          `Failed to generate a valid grid layout after 10 attempts`,
          `Grid dimensions too small for requested region count`,
          `Cell size calculation produced invalid result`,
          `Invalid gap scale: must be between 0 and 1`,
        ];

        // Error logs can have different formats too
        if (Random.chance(0.3)) {
          logs.push(
            formatLog(
              `ERROR IN GRID GENERATION: ${Random.pick(errorMessages)}`,
              'error'
            )
          );
        } else if (Random.chance(0.5)) {
          logs.push(
            formatLog(
              `${Random.pick(errorMessages)} (in ${generateFilePath()})`,
              'error'
            )
          );
        } else {
          logs.push(formatLog(`${Random.pick(errorMessages)}`, 'error'));
        }
      }

      if (showWarnings && Random.chance(0.4) && logs.length < logCount) {
        const warningMessages = [
          `Grid has small cells that may cause visual artifacts`,
          `High gap scale may result in disconnected regions`,
          `Low resolution grid may produce overly simple domains`,
        ];
        logs.push(formatLog(`${Random.pick(warningMessages)}`, 'warn'));
      }

      return logs;
    },

    domain: () => {
      const logs: string[] = [];

      // Domain creation setup - various formats
      const rows = Random.rangeFloor(2, 10);
      const cols = Random.rangeFloor(2, 10);

      if (Random.chance(0.3)) {
        logs.push(
          formatLog(`generateDomainSystem([${cols}, ${rows}])`, 'debug')
        );
      } else if (Random.chance(0.5)) {
        logs.push(
          formatLog(
            `Starting domain system generation with ${cols}×${rows} grid`
          )
        );
      } else {
        logs.push(formatLog(`→ Domain system init (grid: ${cols}×${rows})`));
      }

      // Canvas setup - more variation
      const width = Random.rangeFloor(500, 2000);
      const height = Random.rangeFloor(500, 2000);

      if (
        verbosity === 'verbose' ||
        (verbosity === 'mixed' && Random.chance(0.6))
      ) {
        logs.push(formatLog(`Canvas: ${width}×${height} px`, 'verbose'));
      } else if (Random.chance(0.5)) {
        logs.push(formatLog(`Canvas size: ${width}x${height}`));
      }

      // Gap scale with variation
      const gapScale = Random.range(0.01, 0.1).toFixed(2);
      if (Random.chance(0.7)) {
        logs.push(
          formatLog(
            `Gap scale: ${gapScale}`,
            Random.chance(0.3) ? 'debug' : 'info'
          )
        );
      } else {
        logs.push(formatLog(`Using ${gapScale} for cell spacing coefficient`));
      }

      // Generate regions process with technical variation
      const regionCount = Random.rangeFloor(3, 10);

      if (Random.chance(0.4)) {
        logs.push(
          formatLog(
            `generateRegions(${rows}, ${cols}, ${regionCount}, 100)`,
            'trace'
          )
        );
      } else if (Random.chance(0.3)) {
        logs.push(formatLog(`Creating ${regionCount} initial regions...`));
      } else {
        logs.push(formatLog(`Region count target: ${regionCount}`));
      }

      // Sometimes add details about max attempts
      if (
        verbosity === 'verbose' ||
        (verbosity === 'mixed' && Random.chance(0.3))
      ) {
        const maxAttempts = 100;
        logs.push(formatLog(`Max attempts set to ${maxAttempts}`, 'trace'));
      }

      // Sometimes show internal random selection process
      if (verbosity === 'verbose' && Random.chance(0.5)) {
        logs.push(
          formatLog(
            `Random empty cell selected at [${Random.rangeFloor(
              0,
              cols
            )}, ${Random.rangeFloor(0, rows)}]`,
            'trace'
          )
        );
        logs.push(
          formatLog(`Calculating max dimensions from position...`, 'trace')
        );
      }

      // Find small regions - different formats
      const smallCount = Random.rangeFloor(0, 3);
      if (smallCount > 0) {
        if (Random.chance(0.3)) {
          logs.push(
            formatLog(
              `hasSmall() -> true (found ${smallCount} 1x1 regions)`,
              'debug'
            )
          );
        } else if (Random.chance(0.5)) {
          logs.push(
            formatLog(`Found ${smallCount} small regions with 1x1 dimensions`)
          );
        } else {
          logs.push(
            formatLog(`${smallCount} regions need combining (size = 1x1)`)
          );
        }

        // Show combine process differently sometimes
        if (Random.chance(0.3)) {
          logs.push(formatLog(`combineSmallRegions() started`, 'trace'));
        } else if (Random.chance(0.5)) {
          logs.push(formatLog(`Running region combination algorithm...`));
        } else {
          logs.push(formatLog(`⚙️ Combining small regions`));
        }

        // Show neighbor search with variation
        for (let i = 0; i < smallCount; i++) {
          const regionId = Random.rangeFloor(0, regionCount);

          if (
            verbosity === 'verbose' ||
            (verbosity === 'mixed' && Random.chance(0.4))
          ) {
            if (Random.chance(0.5)) {
              logs.push(
                formatLog(
                  `Finding neighbors for region ${regionId}...`,
                  'debug'
                )
              );
            } else {
              logs.push(
                formatLog(
                  `-> isNeighbour checks for region ${regionId}`,
                  'trace'
                )
              );
            }

            const neighborCount = Random.rangeFloor(0, 4);
            if (Random.chance(0.5)) {
              logs.push(
                formatLog(
                  `Found ${neighborCount} neighbors, ${Random.rangeFloor(
                    0,
                    neighborCount + 1
                  )} suitable`,
                  'debug'
                )
              );
            } else {
              logs.push(
                formatLog(
                  `Neighbors: ${neighborCount}, Suitable: ${Random.rangeFloor(
                    0,
                    neighborCount + 1
                  )}`,
                  'debug'
                )
              );
            }
          }

          // Region combination logs
          if (Random.chance(0.8)) {
            const neighbor = Random.rangeFloor(0, regionCount);

            if (Random.chance(0.3)) {
              logs.push(
                formatLog(`Regions ${regionId} + ${neighbor} combined`, 'info')
              );
            } else if (Random.chance(0.5)) {
              logs.push(
                formatLog(
                  `Combining region ${regionId} with region ${neighbor}`
                )
              );
            } else {
              logs.push(
                formatLog(`Merged: ${regionId} + ${neighbor} -> ${regionId}`)
              );
            }

            // Sometimes add region details
            if (verbosity === 'verbose' && Random.chance(0.3)) {
              logs.push(
                formatLog(`Region data: ${generateDataDump('region')}`, 'debug')
              );
            }
          } else {
            logs.push(
              formatLog(
                `No suitable neighbors for region ${regionId}, skipping`
              )
            );
          }
        }
      }

      // Domain generation - more formats
      const finalRegionCount =
        regionCount -
        (smallCount > 0 ? Random.rangeFloor(1, smallCount + 1) : 0);

      if (Random.chance(0.4)) {
        logs.push(formatLog(`Final region count: ${finalRegionCount}`));
      } else if (Random.chance(0.5)) {
        logs.push(
          formatLog(`After combining: ${finalRegionCount} regions`, 'info')
        );
      } else {
        logs.push(
          formatLog(`${finalRegionCount} regions after combination step`)
        );
      }

      // Convert regions to domains
      if (
        verbosity === 'verbose' ||
        (verbosity === 'mixed' && Random.chance(0.7))
      ) {
        logs.push(
          formatLog(`Converting regions to domains with gap adjustments...`)
        );
      } else if (Random.chance(0.5)) {
        logs.push(formatLog(`Region → Domain conversion`, 'info'));
      }

      // Domain details sometimes
      if (verbosity === 'verbose' && Random.chance(0.4)) {
        logs.push(
          formatLog(`Domain data: ${generateDataDump('domain')}`, 'debug')
        );
      }

      // Selection with different styles
      const selectionCount = Math.min(5, finalRegionCount);
      if (Random.chance(0.3)) {
        logs.push(
          formatLog(
            `Selected first ${selectionCount} domains for polygon`,
            'info'
          )
        );
      } else if (Random.chance(0.5)) {
        logs.push(
          formatLog(
            `Selecting ${selectionCount} domains for polygon generation`
          )
        );
      } else {
        logs.push(
          formatLog(`${selectionCount}/${finalRegionCount} domains selected`)
        );
      }

      // Log domain types differently
      const fullSpanCount = Random.rangeFloor(
        0,
        Math.min(2, selectionCount) + 1
      );
      if (fullSpanCount > 0) {
        if (Random.chance(0.5)) {
          logs.push(
            formatLog(`${fullSpanCount} selected domains are 'full-span' type`)
          );
        } else {
          logs.push(
            formatLog(
              `Found ${fullSpanCount} full-span domains that will be islands`,
              'debug'
            )
          );
        }
      }

      // Finalization - different styles
      if (logs.length < logCount - 1) {
        if (Random.chance(0.3)) {
          logs.push(
            formatLog(
              `Domain generation completed with ${finalRegionCount} domains ✓`
            )
          );
        } else if (Random.chance(0.5)) {
          logs.push(formatLog(`Domains ready: ${finalRegionCount} total`));
        } else {
          logs.push(formatLog(`Domain system generation completed`));
        }
      }

      // Errors/warnings
      if (showErrors && Random.chance(0.3) && logs.length < logCount) {
        const attempts = Random.rangeFloor(1, 12);
        if (attempts > 10) {
          logs.push(
            formatLog(
              `Failed to generate a domain system after ${attempts} attempts`,
              'error'
            )
          );
        } else {
          logs.push(
            formatLog(`Error in attempt ${attempts}, retrying...`, 'error')
          );
        }
      }

      if (showWarnings && Random.chance(0.4) && logs.length < logCount) {
        const warningMessages = [
          `Too many small regions may lead to suboptimal layout`,
          `Few domains selected may result in simple polygon`,
          `Region combination may create irregular shapes`,
        ];
        logs.push(formatLog(`${Random.pick(warningMessages)}`, 'warn'));
      }

      return logs;
    },

    polygon: () => {
      const logs: string[] = [];

      // Polygon generation setup
      const domainCount = Random.rangeFloor(3, 10);
      const selectionCount = Math.min(5, domainCount);

      logs.push(
        `Starting polygon generation from ${selectionCount} selected domains`
      );

      // Domain log
      logs.push(
        `Selected domain IDs: ${Array.from(
          { length: selectionCount },
          (_, i) => i
        ).join(', ')}`
      );

      // Island check
      const islandCount = Random.rangeFloor(0, Math.min(2, selectionCount) + 1);
      if (islandCount > 0) {
        logs.push(
          `Found ${islandCount} 'full-span' domains that will be islands`
        );
      }

      // Polygon generation
      logs.push(`Generating polygon from domain rectangles...`);
      const vertexCount = Random.rangeFloor(
        selectionCount * 4 - 4,
        selectionCount * 4 + 8
      );
      logs.push(`Initial polygon has ${vertexCount} vertices`);

      // Additional processing
      if (Random.chance(0.5)) {
        const simplifiedCount = Math.max(
          4,
          vertexCount - Random.rangeFloor(2, 8)
        );
        logs.push(`Simplifying polygon to ${simplifiedCount} vertices`);
      }

      // Finalization
      if (logs.length < logCount - 1) {
        logs.push(`Polygon generation completed`);
        logs.push(`Final polygon has ${vertexCount} points`);
      }

      // Errors/warnings
      if (showErrors && Random.chance(0.3) && logs.length < logCount) {
        const errorMessages = [
          `Failed to generate valid polygon from selected domains`,
          `Domain rectangles could not form a single continuous shape`,
          `Polygon has self-intersections`,
        ];
        logs.push(`ERROR: ${Random.pick(errorMessages)}`);
      }

      if (showWarnings && Random.chance(0.4) && logs.length < logCount) {
        const warningMessages = [
          `Polygon contains narrow sections that may cause rendering artifacts`,
          `Complex polygon may impact performance during intersections`,
          `Selected domains produce a highly irregular shape`,
        ];
        logs.push(`WARNING: ${Random.pick(warningMessages)}`);
      }

      return logs;
    },

    polygonParts: () => {
      const logs: string[] = [];

      // PolygonParts setup
      const domainCount = Random.rangeFloor(3, 10);
      logs.push(`Creating polygon parts from ${domainCount} domains`);

      const inset = [
        Random.rangeFloor(0, 20),
        Random.rangeFloor(0, 20),
        Random.rangeFloor(0, 20),
        Random.rangeFloor(0, 20),
      ];
      logs.push(`Using inset: [${inset.join(', ')}]`);

      // Intersection process
      logs.push(`Starting PolyBool.intersect operations...`);

      let partsWithArea = 0;
      let islandCount = 0;

      for (let i = 0; i < domainCount && logs.length < logCount - 3; i++) {
        const isIsland = i < 2 && Random.chance(0.4);
        if (isIsland) islandCount++;

        logs.push(
          `Processing domain ${i} (${
            isIsland ? 'island/full-span' : 'default'
          } type)`
        );

        const hasArea = Random.chance(0.7);
        if (hasArea) {
          partsWithArea++;
          const pointCount = Random.rangeFloor(4, 12);
          logs.push(
            `Intersection found area with ${pointCount} points for domain ${i}`
          );
          logs.push(`Setting domain ${i} hasPart = true`);
        } else {
          logs.push(`No intersection area found for domain ${i}`);
        }
      }

      // Finalization
      if (logs.length < logCount - 1) {
        logs.push(
          `Polygon parts generation complete: ${partsWithArea} parts with area`
        );
        if (islandCount > 0) {
          logs.push(
            `Created ${islandCount} island parts from full-span domains`
          );
        }
      }

      // Errors/warnings
      if (showErrors && Random.chance(0.3) && logs.length < logCount) {
        const errorMessages = [
          `PolyBool.intersect failed for domain`,
          `Invalid polygon format for intersection`,
          `Polygon contains self-intersections, cannot proceed`,
        ];
        logs.push(
          `ERROR: ${Random.pick(
            errorMessages
          )} during part generation for domain ${Random.rangeFloor(
            0,
            domainCount
          )}`
        );
      }

      if (showWarnings && Random.chance(0.4) && logs.length < logCount) {
        const warningMessages = [
          `No domains have intersection with polygon`,
          `All parts have zero area, check polygon generation`,
          `Complex intersection shapes may affect performance`,
        ];
        logs.push(`WARNING: ${Random.pick(warningMessages)}`);
      }

      return logs;
    },

    ui: () => {
      const logs: string[] = [];

      // UI generation setup
      logs.push(`Initializing UI element generation`);
      logs.push(
        `UI canvas size: ${Random.rangeFloor(500, 2000)}x${Random.rangeFloor(
          500,
          1500
        )}${Random.pick(units)}`
      );

      const elementCount = Random.rangeFloor(5, 25);
      logs.push(`Creating ${elementCount} UI elements`);

      // Generate UI elements
      for (let i = 0; i < elementCount && logs.length < logCount - 3; i++) {
        const element = Random.pick(uiElements);
        const randomId = Array.from({ length: 6 }, () =>
          Random.pick('abcdefghijklmnopqrstuvwxyz0123456789')
        ).join('');
        const elementId = `ui-${element}-${randomId}`;

        logs.push(`Creating ${element} with id "${elementId}"`);
        logs.push(`Positioning at ${generateCoords()}`);

        if (Random.chance(0.6)) {
          const props = [
            `size: ${Random.rangeFloor(10, 500)}x${Random.rangeFloor(
              10,
              300
            )}${Random.pick(units)}`,
            `visible: ${Random.chance(0.9) ? 'true' : 'false'}`,
            `opacity: ${Random.range(0.1, 1).toFixed(2)}`,
            `z-index: ${Random.rangeFloor(1, 1000)}`,
            `interactive: ${Random.chance(0.8) ? 'true' : 'false'}`,
          ];

          logs.push(`Properties: ${Random.pick(props)}, ${Random.pick(props)}`);
        }

        if (
          element === 'canvas' ||
          element === 'chart' ||
          element === 'graph'
        ) {
          logs.push(
            `Binding data to ${element}: ${generateCount(
              Random.pick(['polygon', 'vertex', 'grid'])
            )}`
          );
        }
      }

      // Finalization
      if (logs.length < logCount - 1) {
        logs.push(`UI element generation completed: ${elementCount} elements`);
        logs.push(`UI build time: ${generateTime()}`);
      }

      // Errors/warnings
      if (showErrors && Random.chance(0.3) && logs.length < logCount) {
        logs.push(`ERROR: ${generateError()} in UI component`);
      }

      if (showWarnings && Random.chance(0.4) && logs.length < logCount) {
        logs.push(`WARNING: ${generateWarning()}`);
      }

      return logs;
    },

    render: () => {
      const logs: string[] = [];

      // Render setup
      const renderMode = Random.pick(renderModes);
      logs.push(`Initializing render system in ${renderMode} mode`);
      logs.push(
        `Render target: ${Random.pick([
          'canvas',
          'webgl',
          'webgl2',
          'webgpu',
          'svg',
          'offscreen',
        ])}`
      );
      logs.push(
        `Resolution: ${Random.rangeFloor(500, 4000)}x${Random.rangeFloor(
          500,
          2500
        )}`
      );

      // Render process
      const frameCount = Random.rangeFloor(1, 60);
      logs.push(
        `Preparing to render ${frameCount} ${
          frameCount > 1 ? 'frames' : 'frame'
        }`
      );

      const objectsToRender = {
        grids: Random.chance(0.7) ? Random.rangeFloor(1, 5) : 0,
        domains: Random.chance(0.6) ? Random.rangeFloor(1, 10) : 0,
        polygons: Random.chance(0.8) ? Random.rangeFloor(5, 100) : 0,
        uiElements: Random.chance(0.5) ? Random.rangeFloor(0, 20) : 0,
      };

      const totalObjects =
        objectsToRender.grids +
        objectsToRender.domains +
        objectsToRender.polygons +
        objectsToRender.uiElements;

      logs.push(`Scene contains: ${totalObjects} objects to render`);

      if (objectsToRender.grids > 0) {
        logs.push(
          `Loading ${objectsToRender.grids} grid${
            objectsToRender.grids > 1 ? 's' : ''
          } with ${generateCount('grid')}`
        );
      }

      if (objectsToRender.domains > 0) {
        logs.push(
          `Loading ${objectsToRender.domains} domain${
            objectsToRender.domains > 1 ? 's' : ''
          }`
        );
      }

      if (objectsToRender.polygons > 0) {
        logs.push(
          `Loading ${objectsToRender.polygons} polygon${
            objectsToRender.polygons > 1 ? 's' : ''
          } with ${generateCount('vertex')}`
        );
      }

      // Render frames
      for (let i = 0; i < frameCount && logs.length < logCount - 3; i++) {
        logs.push(`Rendering frame ${i + 1}/${frameCount}`);

        if (Random.chance(0.6)) {
          logs.push(`Frame ${i + 1} render time: ${generateTime()}`);
        }

        if (Random.chance(0.3)) {
          logs.push(
            `Applied ${Random.pick([
              'shadow mapping',
              'ambient occlusion',
              'post-processing',
              'anti-aliasing',
              'bloom',
              'depth of field',
            ])}`
          );
        }
      }

      // Finalization
      if (logs.length < logCount - 1) {
        logs.push(
          `Rendering completed: ${frameCount} frames at ${Random.rangeFloor(
            30,
            120
          )} FPS`
        );
        logs.push(`Total render time: ${generateTime()}`);
      }

      // Errors/warnings
      if (showErrors && Random.chance(0.3) && logs.length < logCount) {
        logs.push(`ERROR: ${generateError()} during rendering`);
      }

      if (showWarnings && Random.chance(0.4) && logs.length < logCount) {
        logs.push(`WARNING: ${generateWarning()}`);
      }

      return logs;
    },
  };

  // Generate logs based on the specified system phase
  if (systemPhase in logGenerators) {
    // Get initial logs
    let logs = logGenerators[systemPhase]();

    // Ensure we have the requested number of logs
    while (logs.length < logCount) {
      // Add some generic logs if we don't have enough
      if (logs.length < logCount) {
        const processId = Array.from({ length: 8 }, () =>
          Random.pick('ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789')
        ).join('');
        logs.push(`Process ${processId} completed in ${generateTime()}`);
      }

      if (logs.length < logCount && showErrors && Random.chance(0.3)) {
        logs.push(`ERROR: ${generateError()}`);
      }

      if (logs.length < logCount && showWarnings && Random.chance(0.4)) {
        logs.push(`WARNING: ${generateWarning()}`);
      }
    }

    // Trim to exact count
    return logs.slice(0, logCount);
  } else {
    // Default to grid if unsupported phase is specified
    return logGenerators.grid().slice(0, logCount);
  }
}
