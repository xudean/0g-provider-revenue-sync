import React, { useEffect, useMemo, useRef, useState } from "react";
import * as echarts from "echarts";

const DEFAULT_REFRESH_MS = 60000;
const COLORS = ["#da5a35", "#186f65", "#2647c8", "#c78a1a", "#8b3fb1", "#db2f6e", "#2075b8", "#4e7f11"];

function formatAddress(value) {
  if (!value) {
    return "-";
  }
  return `${value.slice(0, 8)}...${value.slice(-6)}`;
}

function formatWeiToOg(value, digits = 4) {
  if (value === null || value === undefined) {
    return "-";
  }
  const raw = String(value);
  const negative = raw.startsWith("-");
  const str = negative ? raw.slice(1) : raw;
  const padded = str.padStart(19, "0");
  const intPart = padded.slice(0, -18).replace(/^0+(?=\d)/, "") || "0";
  const fracPart = padded.slice(-18).replace(/0+$/, "").slice(0, digits);
  const body = fracPart ? `${intPart}.${fracPart}` : intPart;
  return `${negative ? "-" : ""}${body} 0G`;
}

function formatWeiPerMillionTokensToOg(value, digits = 4) {
  if (value === null || value === undefined) {
    return "-";
  }
  return formatWeiToOg(BigInt(String(value)) * 1000000n, digits);
}

function formatPrice(provider) {
  return `In ${formatWeiPerMillionTokensToOg(provider.input_price)} / Out ${formatWeiPerMillionTokensToOg(provider.output_price)}`;
}

function getProviderDisplayName(provider) {
  if (!provider) {
    return "-";
  }
  return provider.model_name || formatAddress(provider.provider_address);
}

function formatBucketRange(timestampMs, bucketMinutes) {
  const start = new Date(timestampMs);
  const end = new Date(timestampMs + (bucketMinutes * 60 * 1000) - (60 * 1000));
  const formatter = new Intl.DateTimeFormat("zh-CN", {
    hour: "2-digit",
    minute: "2-digit",
    hour12: false
  });
  return `${formatter.format(start)} - ${formatter.format(end)}`;
}

async function fetchJson(url, options) {
  const response = await fetch(url, options);
  const body = await response.text();
  let parsed;
  try {
    parsed = body ? JSON.parse(body) : null;
  } catch (_error) {
    parsed = null;
  }
  if (!response.ok) {
    throw new Error(parsed?.message || body || "Request failed");
  }
  return parsed;
}

function useEChart(option) {
  const ref = useRef(null);
  const chartRef = useRef(null);

  useEffect(() => {
    if (!ref.current) {
      return undefined;
    }
    chartRef.current = echarts.init(ref.current);
    const resize = () => chartRef.current?.resize();
    window.addEventListener("resize", resize);
    return () => {
      window.removeEventListener("resize", resize);
      chartRef.current?.dispose();
      chartRef.current = null;
    };
  }, []);

  useEffect(() => {
    if (!chartRef.current) {
      return;
    }
    chartRef.current.setOption(option, {
      notMerge: false,
      lazyUpdate: true
    });
  }, [option]);

  return ref;
}

function MetricCard({ label, value, detail, tone = "warm" }) {
  return (
    <div className={`metric-card metric-card--${tone}`}>
      <div className="metric-card__label">{label}</div>
      <div className="metric-card__value">{value}</div>
      <div className="metric-card__detail">{detail}</div>
    </div>
  );
}

function ProviderDetail({ provider, highlighted }) {
  return (
    <div className={`provider-card ${highlighted ? "provider-card--active" : ""}`}>
      <div className="provider-card__row">
        <span className="provider-card__kind">{provider.service_kind}</span>
        <span className="provider-card__sync">{provider.tee_signer_acknowledged ? "TEE Ready" : "TEE Pending"}</span>
      </div>
      <div className="provider-card__title">{formatAddress(provider.provider_address)}</div>
      <div className="provider-card__full">{provider.provider_address}</div>
        <div className="provider-card__grid">
        <div>
          <div className="provider-card__meta-label">Price / 1M Tokens</div>
          <div className="provider-card__meta-value">{formatPrice(provider)}</div>
        </div>
        <div>
          <div className="provider-card__meta-label">Model</div>
          <div className="provider-card__meta-value">{provider.model_name || "-"}</div>
        </div>
        <div>
          <div className="provider-card__meta-label">URL</div>
          <div className="provider-card__meta-value provider-card__url">{provider.service_url || "-"}</div>
        </div>
        <div>
          <div className="provider-card__meta-label">Type</div>
          <div className="provider-card__meta-value">{provider.service_type || "-"}</div>
        </div>
      </div>
    </div>
  );
}

function App() {
  const [status, setStatus] = useState(null);
  const [summary, setSummary] = useState(null);
  const [providers, setProviders] = useState([]);
  const [topProviders, setTopProviders] = useState([]);
  const [revenueSeries, setRevenueSeries] = useState([]);
  const [serviceKind] = useState("inference");
  const [providerAddress, setProviderAddress] = useState("");
  const [bucketMinutes, setBucketMinutes] = useState(60);
  const [refreshMs, setRefreshMs] = useState(DEFAULT_REFRESH_MS);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  const filteredProviders = useMemo(() => {
    return providers.filter((item) => item.service_kind === "inference");
  }, [providers, serviceKind]);

  const selectedProvider = useMemo(() => {
    return filteredProviders.find((item) => item.provider_address === providerAddress) || null;
  }, [providers, providerAddress]);

  const inferenceTopProviders = useMemo(() => {
    return topProviders.filter((item) => item.service_kind === "inference");
  }, [topProviders]);

  async function refresh() {
    setLoading(true);
    try {
      const query = new URLSearchParams();
      query.set("bucketMinutes", String(bucketMinutes));
      if (serviceKind) {
        query.set("serviceKind", serviceKind);
      }
      if (providerAddress) {
        query.set("providerAddress", providerAddress);
      }

      const [statusData, summaryData, providerData, topData, revenueData] = await Promise.all([
        fetchJson("/api/status"),
        fetchJson("/api/summary"),
        fetchJson("/api/providers"),
        fetchJson("/api/top-providers"),
        fetchJson(`/api/revenue-series?${query.toString()}`)
      ]);

      setStatus(statusData);
      setSummary(summaryData);
      setProviders(providerData);
      setTopProviders(topData);
      setRevenueSeries(revenueData);
      setRefreshMs(statusData?.dbStatus?.syncIntervalMs || DEFAULT_REFRESH_MS);
      setError("");
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    refresh();
    const timer = setInterval(refresh, refreshMs);
    return () => clearInterval(timer);
  }, [bucketMinutes, providerAddress, refreshMs]);

  const providerCountMap = useMemo(() => {
    return Object.fromEntries((summary?.providerCounts || []).map((item) => [item.service_kind, Number(item.count)]));
  }, [summary]);

  const revenueMap = useMemo(() => {
    return Object.fromEntries((summary?.revenueRows || []).map((item) => [item.service_kind, item.total_revenue]));
  }, [summary]);

  const chartOption = useMemo(() => {
    const providerMap = new Map(filteredProviders.map((item) => [item.provider_address, item]));
    const grouped = new Map();
    for (const row of revenueSeries) {
      const key = row.provider_address;
      const provider = providerMap.get(row.provider_address);
      if (!grouped.has(key)) {
        grouped.set(key, {
          name: getProviderDisplayName(provider),
          type: "line",
          smooth: 0.25,
          symbol: "circle",
          symbolSize: 9,
          emphasis: { focus: "series" },
          data: []
        });
      }
      grouped.get(key).data.push([
        Number(row.bucket_unix) * 1000,
        Number(row.revenue),
        row.provider_address
      ]);
    }

    const series = [...grouped.values()].map((item, index) => ({
      ...item,
      lineStyle: { width: 3, color: COLORS[index % COLORS.length] },
      itemStyle: { color: COLORS[index % COLORS.length] },
      areaStyle: { opacity: 0.08, color: COLORS[index % COLORS.length] }
    }));

    return {
      color: COLORS,
      backgroundColor: "transparent",
      animationDuration: 500,
      grid: { top: 56, right: 24, bottom: 52, left: 70 },
      legend: {
        top: 12,
        textStyle: { color: "#51463e", fontFamily: "IBM Plex Sans, sans-serif" }
      },
      tooltip: {
        trigger: "axis",
        backgroundColor: "#201a17",
        borderWidth: 0,
        textStyle: { color: "#f7f1eb" },
        formatter(params) {
          const lines = params.map((param) => {
            const [, value, addr] = param.data;
            const provider = providerMap.get(addr);
            return `${param.marker}${getProviderDisplayName(provider)}: <strong>${formatWeiToOg(value, 6)}</strong>`;
          });
          return [`<div>${formatBucketRange(params[0]?.value?.[0] || 0, bucketMinutes)}</div>`, ...lines].join("<br/>");
        }
      },
      xAxis: {
        type: "time",
        axisLabel: { color: "#6a5f56" },
        axisLine: { lineStyle: { color: "#b6a79a" } }
      },
      yAxis: {
        type: "value",
        axisLabel: {
          color: "#6a5f56",
          formatter: (value) => formatWeiToOg(Math.round(value), 2)
        },
        splitLine: { lineStyle: { color: "rgba(160,143,129,0.22)" } }
      },
      series
    };
  }, [bucketMinutes, filteredProviders, revenueSeries]);

  const chartRef = useEChart(chartOption);

  return (
    <div className="app-shell">
      <div className="backdrop backdrop--one" />
      <div className="backdrop backdrop--two" />
      <main className="page">
        <section className="hero">
          <div className="hero__copy">
            <div className="eyebrow">0G Compute Revenue Radar</div>
            <h1>Provider 收益监控面板</h1>
          </div>
          <div className="hero__status">
            <div className="status-pill">{status?.dbStatus?.network || "loading network"}</div>
            <div className="status-block">
              <span>Sync Interval</span>
              <strong>{status?.dbStatus?.syncIntervalMs || DEFAULT_REFRESH_MS} ms</strong>
            </div>
            <div className="status-block">
              <span>Start Block</span>
              <strong>{status?.dbStatus?.startBlock ?? "-"}</strong>
            </div>
            <div className="status-block">
              <span>Latest Inference</span>
              <strong>{status?.dbStatus?.latestSynced?.inference ?? "-"}</strong>
            </div>
            <button
              className="primary-button"
              type="button"
              onClick={async () => {
                setLoading(true);
                try {
                  await fetchJson("/api/sync", { method: "POST" });
                  await refresh();
                } catch (err) {
                  setError(err.message);
                } finally {
                  setLoading(false);
                }
              }}
            >
              {loading ? "Syncing..." : "Run Sync Now"}
            </button>
          </div>
        </section>

        <section className="metrics">
          <MetricCard
            label="Inference Providers"
            value={providerCountMap.inference ?? 0}
            detail="当前链上 inference provider 数量"
          />
          <MetricCard
            label="Inference Revenue"
            value={formatWeiToOg(revenueMap.inference || "0", 6)}
            detail="按 settlement_cycles 聚合"
          />
          <MetricCard
            label="Tracked Start Block"
            value={status?.dbStatus?.startBlock ?? "-"}
            detail="数据起始区块号"
            tone="cool"
          />
          <MetricCard
            label="Latest Synced Block"
            value={status?.dbStatus?.latestSynced?.inference ?? "-"}
            detail="Inference settlement 已同步到的最新区块"
            tone="cool"
          />
        </section>

        {error ? <div className="error-banner">{error}</div> : null}

        <section className="dashboard-grid">
          <div className="panel panel--chart">
            <div className="panel__header">
              <div>
                <div className="panel__eyebrow">Revenue Trend</div>
                <h2>Inference Provider 收益图</h2>
              </div>
              <div className="controls">
                <select value={providerAddress} onChange={(e) => setProviderAddress(e.target.value)}>
                  <option value="">所有 provider</option>
                  {filteredProviders.map((item) => (
                    <option key={item.provider_address} value={item.provider_address}>
                      {item.provider_address}
                    </option>
                  ))}
                </select>
                <select value={bucketMinutes} onChange={(e) => setBucketMinutes(Number(e.target.value))}>
                  <option value={10}>10 分钟</option>
                  <option value={60}>1 小时</option>
                  <option value={360}>6 小时</option>
                  <option value={1440}>1 天</option>
                </select>
              </div>
            </div>
            <div className="chart-frame">
              <div ref={chartRef} className="chart-canvas" />
            </div>
            <div className="chart-caption">
              鼠标悬浮可查看具体 revenue 数值，单位已经格式化为 0G。
            </div>
          </div>

          <div className="panel panel--providers">
            <div className="panel__header">
              <div>
                <div className="panel__eyebrow">Provider Details</div>
                <h2>Provider 明细</h2>
              </div>
            </div>
            <div className="providers-list">
              {(selectedProvider ? [selectedProvider] : filteredProviders).map((provider) => (
                <ProviderDetail
                  key={provider.provider_address}
                  provider={provider}
                  highlighted={provider.provider_address === providerAddress}
                />
              ))}
            </div>
          </div>
        </section>

        <section className="bottom-grid">
          <div className="panel">
            <div className="panel__header">
              <div>
                <div className="panel__eyebrow">Leaderboard</div>
                <h2>Top Inference Providers</h2>
              </div>
            </div>
            <div className="table-shell">
              <table>
                <thead>
                  <tr>
                    <th>Kind</th>
                    <th>Address</th>
                    <th>Total Revenue</th>
                    <th>Cycles</th>
                    <th>Last Seen</th>
                  </tr>
                </thead>
                <tbody>
                  {inferenceTopProviders.map((item) => (
                    <tr key={item.provider_address}>
                      <td>inference</td>
                      <td title={item.provider_address}>{formatAddress(item.provider_address)}</td>
                      <td>{formatWeiToOg(item.total_revenue, 6)}</td>
                      <td>{item.cycle_count}</td>
                      <td>{new Date(Number(item.last_seen) * 1000).toLocaleString()}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          <div className="panel">
            <div className="panel__header">
              <div>
                <div className="panel__eyebrow">Sync State</div>
                <h2>后台状态</h2>
              </div>
            </div>
            <div className="sync-state">
              <div className="sync-state__item">
                <span>Sync In Progress</span>
                <strong>true</strong>
              </div>
              <div className="sync-state__item">
                <span>Last Finished</span>
                <strong>{status?.runtime?.lastRun?.finishedAt || "-"}</strong>
              </div>
              <div className="sync-state__item">
                <span>Latest Inference</span>
                <strong>{status?.dbStatus?.latestSynced?.inference ?? "-"}</strong>
              </div>
            </div>
          </div>
        </section>
      </main>
    </div>
  );
}

export default App;
