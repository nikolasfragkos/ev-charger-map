import { ConnectorType, Prisma, PrismaClient } from '@prisma/client'
import fs from 'node:fs'
import { parse } from 'csv-parse/sync'

interface CsvRow {
  Brand: string
  Model: string
  Variant?: string
  Usable_Battery_kWh: string
  AC_Max_kW: string
  DC_Max_kW: string
  DC_Charging_Curve: string
  DC_Curve_Is_Default: string
  DC_Ports: string
  AC_Ports: string
}

let ensured = false
let seedingPromise: Promise<void> | null = null

function normalizePorts(value: string): ConnectorType[] {
  if (!value) return []

  return value
    .split(',')
    .map(port => port.trim().toUpperCase())
    .filter((port): port is ConnectorType =>
      ['CCS', 'CHADEMO', 'TYPE2', 'TYPE1', 'SCHUKO'].includes(port),
    )
}

function parseNumber(value: string): number {
  const parsed = parseFloat(value)
  return Number.isFinite(parsed) ? parsed : 0
}

export async function ensureCarCatalogSeeded(prisma: PrismaClient) {
  if (ensured) return
  if (seedingPromise) return seedingPromise

  seedingPromise = (async () => {
    const existing = await prisma.car.count()
    if (existing > 0) {
      ensured = true
      return
    }

    const csvUrl = new URL('./ev_models_battery_variants.csv', import.meta.url)
    const fileContent = fs.readFileSync(csvUrl, 'utf8')
    const rows = parse(fileContent, {
      columns: true,
      skip_empty_lines: true,
      trim: true,
    }) as CsvRow[]

    const cars = rows.map(row => {
      let dcChargingCurve: Prisma.InputJsonValue = []
      try {
        const sanitized = row.DC_Charging_Curve.replace(/""/g, '"')
        const parsed = JSON.parse(sanitized) as Prisma.JsonValue
        dcChargingCurve = Array.isArray(parsed) ? parsed : []
      } catch {
        dcChargingCurve = []
      }

      const dcCurveIsDefault = row.DC_Curve_Is_Default?.toLowerCase() === 'true'

      return {
        brand: row.Brand,
        model: row.Model,
        variant: row.Variant || null,
        usableBatteryKWh: parseNumber(row.Usable_Battery_kWh),
        acMaxKW: parseNumber(row.AC_Max_kW),
        dcMaxKW: parseNumber(row.DC_Max_kW),
        dcChargingCurve,
        dcCurveIsDefault,
        dcPorts: normalizePorts(row.DC_Ports),
        acPorts: normalizePorts(row.AC_Ports),
      }
    })

    const batchSize = 150
    for (let i = 0; i < cars.length; i += batchSize) {
      const batch = cars.slice(i, i + batchSize)
      await prisma.car.createMany({ data: batch, skipDuplicates: true })
    }

    ensured = true
  })()

  try {
    await seedingPromise
  } finally {
    seedingPromise = null
  }
}
