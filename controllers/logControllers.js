import logData from "../models/logModel.js";

export const postLogs = async (req, res) => {
  try {
    const { traceId, method, endpoint, status, responseTimeMs, logs } = req.body;

    // Combine logs into one string, preserving style
    const combinedMessage =
      logs && logs.length > 0
        ? logs.map(log => `[${log.type}] ${log.message}`).join("\n") // keep newlines
        : "No details provided";

    const finalLogs = [
      {
        timestamp: new Date().toISOString(),
        type: "INFO",
        message: combinedMessage,
      },
    ];

    const data = new logData({
      traceId,
      method,
      endpoint,
      status,
      responseTimeMs,
      logs: finalLogs,
    });

    await data.save();

    res.status(201).json({
      status: "success",
      message: "Log added",
      data,
    });
  } catch (error) {
    console.error("Error saving log:", error);
    res.status(500).json({ status: "error", message: "Failed to add log" });
  }
};

export const getLogs = async (req, res) => {
  try {
    const data = await logData.find().sort({ "logs.timestamp": -1 });

    res.status(200).json({ message: "All the logs", data });
  } catch (error) {
    res
      .status(500)
      .json({ status: "error", message: "Failed to retrieve log" });
  }
};

export const getLogsTime = async (req, res) => {
  try {
    let { year, month } = req.query;

    // Validate incoming query; keep as numbers if present
    const hasYearMonth = !!year && !!month;
    if (hasYearMonth) {
      year = Number(year);
      month = Number(month);
      if (Number.isNaN(year) || Number.isNaN(month)) {
        return res.status(400).json({ error: "Invalid year or month" });
      }
    }

    // helper to fetch grouped logs for a start/end range
    const fetchGrouped = async (start, end) => {
      const logs = await logData
        .find({ "logs.timestamp": { $gte: start, $lt: end } })
        .sort({ "logs.timestamp": 1 })
        .select("traceId method endpoint status logs.timestamp");

      const grouped = {};
      logs.forEach((log) => {
        const filteredLogs = log.logs.filter(
          (l) => l.timestamp >= start && l.timestamp < end
        );

        filteredLogs.forEach((l) => {
          const baseEndpoint = log.endpoint.split("/").slice(0, 3).join("/");

          if (!grouped[baseEndpoint]) grouped[baseEndpoint] = [];

          grouped[baseEndpoint].push({
            traceId: log.traceId,
            method: log.method,
            endpoint: log.endpoint,
            status: log.status,
            timestamp: l.timestamp,
          });
        });
      });

      return grouped;
    };

    // If user provided year/month, try that month first
    if (hasYearMonth) {
      const start = new Date(year, month - 1, 1);
      const end = new Date(year, month, 1);

      let grouped = await fetchGrouped(start, end);

      // if data found, return it
      if (Object.keys(grouped).length > 0) {
        return res
          .status(200)
          .json({ message: "Grouped logs", data: grouped, year, month });
      }

      // otherwise fall through to find latest month with data
    }

    // No valid requested data (either not provided or empty) -> find latest log timestamp
    // Use aggregation to get the latest logs.timestamp across the collection
    const latestAgg = await logData.aggregate([
      { $unwind: "$logs" },
      { $sort: { "logs.timestamp": -1 } },
      { $limit: 1 },
      { $project: { ts: "$logs.timestamp" } },
    ]);

    if (!latestAgg || latestAgg.length === 0) {
      // No logs at all
      return res
        .status(200)
        .json({ message: "No logs available", data: {}, year: null, month: null });
    }

    const latestTs = new Date(latestAgg[0].ts);
    const ly = latestTs.getFullYear();
    const lm = latestTs.getMonth() + 1;

    // Fetch grouped logs for that latest month
    const latestStart = new Date(ly, lm - 1, 1);
    const latestEnd = new Date(ly, lm, 1);
    const groupedLatest = await fetchGrouped(latestStart, latestEnd);

    return res
      .status(200)
      .json({ message: "Grouped logs (latest available)", data: groupedLatest, year: ly, month: lm });
  } catch (error) {
    console.error("getLogsTime error:", error);
    res.status(500).json({ status: "error", message: "Failed to fetch logs" });
  }
};

const countLogsInRange = async (start, end) => {
  return await logData.countDocuments({ "logs.timestamp": { $gte: start, $lt: end } });
};

const computeAnalysisForRange = async (start, end) => {
  const success = await logData.countDocuments({
    status: { $in: [200, 304] },
    "logs.timestamp": { $gte: start, $lt: end },
  });

  const fail = await logData.countDocuments({
    status: { $nin: [200, 304] },
    "logs.timestamp": { $gte: start, $lt: end },
  });

  const total = await logData.countDocuments({
    "logs.timestamp": { $gte: start, $lt: end },
  });

  const uptimePercent = total > 0 ? (success / total) * 100 : 0;
  const errorPercent = total > 0 ? (fail / total) * 100 : 0;

  const maxErrorStatus = await logData.aggregate([
    {
      $match: {
        status: { $gte: 400, $lt: 600 },
        "logs.timestamp": { $gte: start, $lt: end },
      },
    },
    {
      $group: {
        _id: "$status",
        count: { $sum: 1 },
      },
    },
    { $sort: { count: -1 } },
    { $limit: 1 },
  ]);

  const lastErrorLog = await logData
    .findOne({
      status: { $gte: 400, $lt: 600 },
      "logs.timestamp": { $gte: start, $lt: end },
    })
    .sort({ "logs.timestamp": -1 })
    .lean();

  let lastTimestamp = null;
  if (lastErrorLog && Array.isArray(lastErrorLog.logs) && lastErrorLog.logs.length) {
    const candidate = lastErrorLog.logs
      .map((l) => new Date(l.timestamp))
      .filter((t) => t >= start && t < end)
      .sort((a, b) => b - a)[0];
    lastTimestamp = candidate || null;
  }

  const timeAgg = await logData.aggregate([
    {
      $match: {
        "logs.timestamp": { $gte: start, $lt: end },
      },
    },
    {
      $group: {
        _id: null,
        totalResponseTime: { $sum: "$responseTimeMs" },
        avgResponseTime: { $avg: "$responseTimeMs" },
      },
    },
  ]);

  const totalResponseTime = timeAgg[0]?.totalResponseTime || 0;
  const avgResponseTime = timeAgg[0]?.avgResponseTime || 0;

  return {
    totalRequests: total,
    success,
    fail,
    uptimePercent,
    errorPercent,
    maxErrorStatus: maxErrorStatus[0] || null,
    lastErrorTimestamp: lastTimestamp,
    totalResponseTime,
    avgResponseTime,
  };
};

export const getAnalysis = async (req, res) => {
  try {
    let { year, month } = req.query;
    const hasYearMonth = !!year && !!month;

    if (hasYearMonth) {
      year = Number(year);
      month = Number(month);
      if (Number.isNaN(year) || Number.isNaN(month)) {
        return res.status(400).json({ error: "Invalid year or month" });
      }
    } else {
      // If no year/month provided, treat as fallthrough to find latest
    }

    // Try requested month first (if provided)
    if (hasYearMonth) {
      const start = new Date(year, month - 1, 1);
      const end = new Date(year, month, 1);
      const c = await countLogsInRange(start, end);
      if (c > 0) {
        const analysis = await computeAnalysisForRange(start, end);
        return res.status(200).json({ ...analysis, year, month, isFallback: false });
      }
      // else fall through to find latest month with data
    }

    // Find latest logs.timestamp across collection
    const latestAgg = await logData.aggregate([
      { $unwind: "$logs" },
      { $sort: { "logs.timestamp": -1 } },
      { $limit: 1 },
      { $project: { ts: "$logs.timestamp" } },
    ]);

    if (!latestAgg || latestAgg.length === 0) {
      // No logs in DB
      return res.status(200).json({
        year: null,
        month: null,
        isFallback: false,
        message: "No logs available",
        totalRequests: 0,
      });
    }

    const latestTs = new Date(latestAgg[0].ts);
    const ly = latestTs.getFullYear();
    const lm = latestTs.getMonth() + 1;
    const latestStart = new Date(ly, lm - 1, 1);
    const latestEnd = new Date(ly, lm, 1);

    const analysis = await computeAnalysisForRange(latestStart, latestEnd);
    return res.status(200).json({ ...analysis, year: ly, month: lm, isFallback: true });
  } catch (error) {
    console.error("getAnalysis error:", error);
    res.status(500).json({ status: "error", message: error.message });
  }
};

export const getUptime = async (req, res) => {
  try {
    let { year, month } = req.query;
    const hasYearMonth = !!year && !!month;

    if (hasYearMonth) {
      year = Number(year);
      month = Number(month);
      if (Number.isNaN(year) || Number.isNaN(month)) {
        return res.status(400).json({ error: "Invalid year or month" });
      }
    }

    const computeUptimeFor = async (y, m) => {
      const start = new Date(y, m - 1, 1);
      const end = new Date(y, m, 1);

      // quick existence check
      const totalCount = await countLogsInRange(start, end);
      if (totalCount === 0) return null;

      const docs = await logData.find({ "logs.timestamp": { $gte: start, $lt: end } }).lean();

      const dayMap = new Map();
      docs.forEach((doc) => {
        const relevant = (doc.logs || []).filter((l) => {
          const t = new Date(l.timestamp);
          return t >= start && t < end;
        });

        relevant.forEach((l) => {
          const day = new Date(l.timestamp).getDate();
          if (!dayMap.has(day)) dayMap.set(day, { total: 0, success: 0 });
          const entry = dayMap.get(day);
          entry.total += 1;
          if ([200, 304].includes(doc.status)) entry.success += 1;
        });
      });

      const daysInMonth = new Date(y, m, 0).getDate();
      const filledStats = [];
      for (let d = 1; d <= daysInMonth; d++) {
        const entry = dayMap.get(d);
        const uptimePercent = entry ? (entry.success / entry.total) * 100 : 0;
        filledStats.push({
          date: new Date(y, m - 1, d),
          uptimePercent,
        });
      }
      return filledStats;
    };

    // Try requested month first
    if (hasYearMonth) {
      const uptimeRes = await computeUptimeFor(year, month);
      if (uptimeRes) {
        return res.status(200).json({ data: uptimeRes, year, month, isFallback: false });
      }
      // else fall through
    }

    // Find latest month with logs
    const latestAgg = await logData.aggregate([
      { $unwind: "$logs" },
      { $sort: { "logs.timestamp": -1 } },
      { $limit: 1 },
      { $project: { ts: "$logs.timestamp" } },
    ]);

    if (!latestAgg || latestAgg.length === 0) {
      return res.status(200).json({ data: [], year: null, month: null, isFallback: false });
    }

    const latestTs = new Date(latestAgg[0].ts);
    const ly = latestTs.getFullYear();
    const lm = latestTs.getMonth() + 1;

    const uptimeRes = await computeUptimeFor(ly, lm);
    if (!uptimeRes) {
      return res.status(200).json({ data: [], year: null, month: null, isFallback: false });
    }
    return res.status(200).json({ data: uptimeRes, year: ly, month: lm, isFallback: true });
  } catch (err) {
    console.error("getUptime error:", err);
    res.status(500).json({ error: err.message });
  }
};
