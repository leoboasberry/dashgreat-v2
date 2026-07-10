#!/usr/bin/env python3
"""
Importa eventos históricos do CRM (exportados em CSV) para a tabela events do Supabase.
Uso:
  python3 import_crm_events.py --file TaskMql.csv --type mql
  python3 import_crm_events.py --file TaskSQL.csv  --type sql  --date-col "Data de entrada em SQL"
  python3 import_crm_events.py --file TaskGanho.csv --type deal_won

Upsert idempotente em event_id — pode rodar múltiplas vezes sem duplicar.
"""

import argparse
import csv
import json
import os
import re
import sys
import time
from datetime import datetime, timezone
from urllib.request import Request, urlopen
from urllib.error import HTTPError, URLError

# ── Configuração ──────────────────────────────────────────────────────────────

SUPABASE_URL  = "https://nujbmgzimpizxiehfzos.supabase.co"
SUPABASE_KEY  = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im51amJtZ3ppbXBpenhpZWhmem9zIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3MzkzMDk0OSwiZXhwIjoyMDg5NTA2OTQ5fQ.SW7gcd-kxKhUpkx1mkdH2y65fuswiW6QTIYW-coJnm8"

# Colunas padrão de data por tipo de evento (sobrescrevíveis via --date-col)
DEFAULT_DATE_COL = {
    "mql":              "Data de criação",
    "sql":              "Data de criação",       # ajuste se o CSV tiver coluna específica
    "opportunity":      "Data de criação",
    "meeting_completed":"Data Reunião de Vendas (Agendada)",
    "deal_won":         "Data do pagamento efetuado",
    "deal_lost":        "Data/Hora Entrada em Perdido",
    "not_mql":          "Data de criação",
}

BATCH_SIZE = 25   # linhas por request (menor para poupar Disk IO em instâncias NANO)
SLEEP_BETWEEN_BATCHES = 1.0   # segundos — evita esgotar Disk IO Budget

# ── Helpers ───────────────────────────────────────────────────────────────────

def parse_br_date(raw: str):
    """
    Converte datas no formato brasileiro para (event_date YYYY-MM-DD, event_ts ISO).
    Aceita: "31/03/2026 22:22", "31/03/2026", "2026-03-31", "-", ""
    """
    raw = raw.strip()
    if not raw or raw == "-":
        return None, None
    # Já em formato ISO
    if re.match(r"\d{4}-\d{2}-\d{2}", raw):
        date_part = raw[:10]
        ts_part = raw.replace(" ", "T") + (".000Z" if "T" not in raw else "+00:00")
        return date_part, ts_part
    # Formato BR: dd/mm/yyyy HH:MM
    m = re.match(r"(\d{2})/(\d{2})/(\d{4})(?: (\d{2}):(\d{2}))?", raw)
    if m:
        d, mo, y = m.group(1), m.group(2), m.group(3)
        date_part = f"{y}-{mo}-{d}"
        if m.group(4):
            ts_part = f"{y}-{mo}-{d}T{m.group(4)}:{m.group(5)}:00.000Z"
        else:
            ts_part = f"{y}-{mo}-{d}T00:00:00.000Z"
        return date_part, ts_part
    return None, None


def parse_br_money(raw: str):
    """Converte "6.280,00" ou "R$ 3.690" → float, ou None se inválido."""
    raw = raw.strip().lstrip("R$").strip()
    if not raw or raw == "-":
        return None
    raw = raw.replace(".", "").replace(",", ".")
    try:
        return float(raw)
    except ValueError:
        return None


def infer_platform(utm_source: str, origem: str):
    src = utm_source.lower()
    if src in ("facebook", "instagram", "fb"):
        return "meta"
    if "google" in src:
        return "google"
    if "linkedin" in src:
        return "linkedin"
    if "tiktok" in src:
        return "tiktok"
    if "bing" in src or "microsoft" in src:
        return "bing"
    return None


def row_to_event(row, event_type, date_col):
    deal_id = row.get("Key do Deal", "").strip()
    if not deal_id:
        return None

    raw_date = row.get(date_col, "").strip()
    event_date, event_ts = parse_br_date(raw_date)

    # Datas placeholder do CRM (ex: 31/12/1999) ou muito antigas → fallback
    if event_date and event_date < "2000-01-01":
        event_date, event_ts = None, None

    # Se não tiver data válida, usa Data de criação como fallback
    if not event_date:
        raw_date = row.get("Data de criação", "").strip()
        event_date, event_ts = parse_br_date(raw_date)
    if not event_ts:
        return None   # sem data = sem evento

    utm_source   = row.get("utmSource", "").strip()
    utm_campaign = row.get("utmCampaign", "").strip()
    revenue      = row.get("Faixa de faturamento", "").strip()
    segment      = row.get("Segmento", "").strip()
    origem       = row.get("Origem", "").strip()
    email        = row.get("Email do contato", "").strip().lower()
    mrr_raw      = row.get("Valor do contrato", "").strip()
    mrr          = parse_br_money(mrr_raw)
    platform     = infer_platform(utm_source, origem)

    # event_id: mesmo formato do sistema original
    event_id = f"{deal_id}:{event_type}:{event_ts}"

    payload = {
        "deal": {
            "utmCampaign":  utm_campaign or None,
            "utmSource":    utm_source   or None,
            "revenue":      revenue      or None,
            "segment":      segment      or None,
            "platform":     platform,
            "potentialNewMRR": mrr,
            "annualRevenue": revenue     or None,
        },
        "utmSource": utm_source or None,
        "utmCampaign": utm_campaign or None,
        "revenue":  revenue  or None,
        "segment":  segment  or None,
        "event_type": event_type,
        # Campos ausentes no CSV (manter compatibilidade com o schema)
        "pagina": None,
        "revenueNormalization": {
            "normalizedValue": revenue or None,
            "source": "csv_import",
        } if revenue else None,
    }

    return {
        "event_id":     event_id,
        "event_type":   event_type,
        "event_ts":     event_ts,
        "event_date":   event_date,
        "deal_id":      deal_id,
        "email_norm":   email or None,
        "export_status":"csv_import",
        "payload":      payload,
        "utm_campaign": utm_campaign or None,
    }


def upsert_batch(records, retries=3):
    """Envia um batch via upsert (on_conflict=event_id). Retorna (status_code, erro)."""
    body = json.dumps(records).encode()
    last_err = None
    for attempt in range(retries):
        if attempt > 0:
            time.sleep(2 ** attempt)  # backoff: 2s, 4s
        req = Request(
            f"{SUPABASE_URL}/rest/v1/events?on_conflict=event_id",
            data=body,
            headers={
                "apikey":        SUPABASE_KEY,
                "Authorization": f"Bearer {SUPABASE_KEY}",
                "Content-Type":  "application/json",
                "Prefer":        "resolution=ignore-duplicates,return=minimal",
            },
            method="POST",
        )
        try:
            with urlopen(req, timeout=60) as resp:
                return resp.status, None
        except HTTPError as e:
            body_err = e.read().decode()[:300]
            return e.code, body_err
        except (URLError, OSError) as e:
            last_err = str(e)
    return 0, last_err


# ── Main ──────────────────────────────────────────────────────────────────────

def main():
    parser = argparse.ArgumentParser(description="Importa eventos CRM para Supabase")
    parser.add_argument("--file",     required=True, help="Caminho do CSV")
    parser.add_argument("--type",     required=True,
                        choices=["mql","not_mql","sql","opportunity","meeting_completed","deal_won","deal_lost"],
                        help="event_type a inserir")
    parser.add_argument("--date-col", help="Coluna de data do evento (sobrescreve padrão)")
    parser.add_argument("--dry-run",  action="store_true", help="Não envia ao Supabase")
    args = parser.parse_args()

    date_col = args.date_col or DEFAULT_DATE_COL.get(args.type, "Data de criação")
    print(f"Arquivo:    {args.file}")
    print(f"event_type: {args.type}")
    print(f"date_col:   {date_col}")
    print(f"dry_run:    {args.dry_run}")
    print()

    with open(args.file, encoding="utf-8") as f:
        reader = csv.DictReader(f)
        rows = list(reader)

    print(f"Linhas no CSV: {len(rows)}")

    events = []
    skipped = 0
    for row in rows:
        ev = row_to_event(row, args.type, date_col)
        if ev:
            events.append(ev)
        else:
            skipped += 1

    print(f"Eventos válidos: {len(events)}  |  Pulados (sem data/deal_id): {skipped}")
    if not events:
        print("Nada para importar.")
        return

    if args.dry_run:
        print("\n-- DRY RUN: primeiro evento que seria enviado --")
        print(json.dumps(events[0], indent=2, ensure_ascii=False))
        return

    # Envio em batches
    total_ok = 0
    total_err = 0
    batches = [events[i:i+BATCH_SIZE] for i in range(0, len(events), BATCH_SIZE)]
    print(f"\nEnviando {len(batches)} batches de até {BATCH_SIZE} linhas...")

    for i, batch in enumerate(batches, 1):
        status, err = upsert_batch(batch)
        if status in (200, 201):
            total_ok += len(batch)
            print(f"  [{i:3d}/{len(batches)}] OK ({len(batch)} registros)", end="\r")
        else:
            total_err += len(batch)
            print(f"  [{i:3d}/{len(batches)}] ERRO {status}: {err}")
        time.sleep(SLEEP_BETWEEN_BATCHES)

    print(f"\nConcluído: {total_ok} inseridos/atualizados, {total_err} com erro.")


if __name__ == "__main__":
    main()
