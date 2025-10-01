import logData from "../models/logModel.js";

export const postLogs = async (req, res) => {
  try {
    const { traceId, method, endpoint, status, responseTimeMs, logs } =
      req.body;

    const finalLogs =
      logs && logs.length > 0
        ? logs
        : [
            {
              timestamp: new Date().toISOString(),
              type: "INFO",
              message: "No details provided",
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
    const { year, month } = req.query;

    if (!year || !month) {
      return res.status(400).json({ error: "Please provide year and month" });
    }

    const start = new Date(year, month - 1, 1);
    const end = new Date(year, month, 1);

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
    //console.log(grouped);
    res.status(200).json({ message: "Grouped logs", data: grouped });
  } catch (error) {
    res.status(500).json({ status: "error", message: "Failed to fetch logs" });
  }
};

export const getAnalysis = async (req, res) => {
  try {
    const { year, month } = req.query; // e.g. year=2025, month=09

    if (!year || !month) {
      return res
        .status(400)
        .json({
          error: "Please provide year and month (e.g. ?year=2025&month=09)",
        });
    }

    const start = new Date(year, month - 1, 1); // first day of month
    const end = new Date(year, month, 1); // first day of next month

    // ✅ Success count (200, 304)
    const success = await logData.countDocuments({
      status: { $in: [200, 304] },
      "logs.timestamp": { $gte: start, $lt: end },
    });

    // ✅ Failure count (anything else)
    const fail = await logData.countDocuments({
      status: { $nin: [200, 304] },
      "logs.timestamp": { $gte: start, $lt: end },
    });

    // ✅ Total logs in that month
    const total = await logData.countDocuments({
      "logs.timestamp": { $gte: start, $lt: end },
    });

    const uptimePercent = total > 0 ? (success / total) * 100 : 0;
    const errorPercent = total > 0 ? (fail / total) * 100 : 0;

    // ✅ Max repeated 4xx/5xx status
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

    // ✅ Last error log timestamp (4xx/5xx)
    const lastErrorLog = await logData
      .findOne({
        status: { $gte: 400, $lt: 600 },
        "logs.timestamp": { $gte: start, $lt: end },
      })
      .sort({ "logs.timestamp": -1 });

    const lastTimestamp = lastErrorLog?.logs?.[0]?.timestamp || null;

    // ✅ Total & Average Response Time
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

    // ✅ Final response
    res.status(200).json({
      year,
      month,
      totalRequests: total,
      success,
      fail,
      uptimePercent,
      errorPercent,
      maxErrorStatus: maxErrorStatus[0] || null,
      lastErrorTimestamp: lastTimestamp,
      totalResponseTime,
      avgResponseTime,
    });
  } catch (error) {
    res.status(500).json({ status: "error", message: error.message });
  }
};

export const getUptime = async (req, res) => {
  try {
    const { year, month } = req.query;

    if (!year || !month) {
      return res
        .status(400)
        .json({
          error: "Please provide year and month (e.g. ?year=2025&month=09)",
        });
    }

    const start = new Date(year, month-1, 1); // first day of month
    const end = new Date(year, month, 1); // first day of next month

    // Step 1: Get all logs for that month
    const logs = await logData
      .find({
        "logs.timestamp": { $gte: start, $lt: end },
      })
      .lean();

    //console.log(logs)

    // Step 2: Group by day
    const dayMap = new Map();

    logs.forEach((log) => {
      const date = new Date(log.logs[0].timestamp);
      const day = date.getDate(); // 1–31

      if (!dayMap.has(day)) {
        dayMap.set(day, { total: 0, success: 0 });
      }

      const entry = dayMap.get(day);
      entry.total += 1;

      // ✅ success if status is 200 or 304
      if ([200, 304].includes(log.status)) {
        entry.success += 1;
      }
    });

    //console.log(dayMap)

    const daysInMonth = new Date(year, month, 0).getDate();
    const filledStats = [];

    for (let d = 1; d <= daysInMonth; d++) {
      const entry = dayMap.get(d);
      let uptimePercent = null;

      if (entry) {
        uptimePercent = (entry.success / entry.total) * 100;
      }

      filledStats.push({
        date: new Date(year, month - 1, d ),
        uptimePercent: uptimePercent ?? 0, // can also return null
      });
    }
    //console.log(filledStats)
    res.json(filledStats);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};