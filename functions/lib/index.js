"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.onPurchaseOrderWrite = void 0;
require("./env");
const logger = __importStar(require("firebase-functions/logger"));
const app_1 = require("firebase-admin/app");
const firestore_1 = require("firebase-admin/firestore");
const firestore_2 = require("firebase-functions/v2/firestore");
const nodemailer_1 = __importDefault(require("nodemailer"));
(0, app_1.initializeApp)();
const db = (0, firestore_1.getFirestore)();
function allRoles(data) {
    const out = [];
    if (data.role)
        out.push(data.role);
    if (Array.isArray(data.roles)) {
        for (const r of data.roles) {
            if (r && !out.includes(r))
                out.push(r);
        }
    }
    return out;
}
function hasRole(data, role) {
    return allRoles(data).includes(role);
}
async function loadRecipientEmails() {
    const snap = await db.collection("users").get();
    const adminEmails = [];
    const purchaserEmails = [];
    snap.docs.forEach((d) => {
        const data = d.data();
        const email = (data.email || "").trim().toLowerCase();
        if (!email)
            return;
        if (hasRole(data, "admin"))
            adminEmails.push(email);
        if (hasRole(data, "purchaser"))
            purchaserEmails.push(email);
    });
    return {
        adminEmails: [...new Set(adminEmails)],
        purchaserEmails: [...new Set(purchaserEmails)],
    };
}
async function getUserEmail(uid) {
    const docSnap = await db.collection("users").doc(uid).get();
    if (!docSnap.exists)
        return null;
    const email = docSnap.data()?.email?.trim();
    return email || null;
}
function smtpEnvDiagnostics() {
    return {
        SMTP_HOST: !!process.env.SMTP_HOST?.trim(),
        SMTP_FROM: !!process.env.SMTP_FROM?.trim(),
        SMTP_USER: !!process.env.SMTP_USER?.trim(),
        SMTP_PASS: !!process.env.SMTP_PASS?.trim(),
    };
}
function getTransporter() {
    const host = process.env.SMTP_HOST;
    const from = process.env.SMTP_FROM;
    const user = process.env.SMTP_USER;
    const pass = process.env.SMTP_PASS;
    if (!host || !from || !user || !pass) {
        return null;
    }
    const port = parseInt(process.env.SMTP_PORT || "587", 10);
    const secure = process.env.SMTP_SECURE === "true" || process.env.SMTP_SECURE === "1" || port === 465;
    return nodemailer_1.default.createTransport({
        host,
        port,
        secure,
        auth: { user, pass },
    });
}
function appBaseUrl() {
    return (process.env.APP_BASE_URL || "").replace(/\/$/, "");
}
function poLabel(data, poId) {
    const name = typeof data.name === "string" && data.name.trim() ? data.name.trim() : "";
    return name || `PO #${poId.slice(-6).toUpperCase()}`;
}
async function sendEmail(opts) {
    await opts.transporter.sendMail({
        from: opts.from,
        to: opts.to,
        subject: opts.subject,
        html: opts.html,
    });
}
function footerLinks() {
    const base = appBaseUrl();
    if (!base) {
        return "<p style=\"color:#666;font-size:12px\">Open the PO app to view details.</p>";
    }
    return `<p style="margin-top:16px;font-size:13px">
    <a href="${base}/pending-approval">Pending approval</a> ·
    <a href="${base}/pending-purchase">Pending purchase</a> ·
    <a href="${base}/my-pos">My POs</a>
  </p>`;
}
exports.onPurchaseOrderWrite = (0, firestore_2.onDocumentWritten)({
    document: "purchaseOrders/{poId}",
    region: process.env.FUNCTIONS_REGION || "us-central1",
}, async (event) => {
    const change = event.data;
    if (!change) {
        return;
    }
    const afterSnap = change.after;
    if (!afterSnap.exists) {
        return;
    }
    const beforeData = change.before.exists
        ? change.before.data()
        : null;
    const after = afterSnap.data();
    const poId = event.params.poId;
    const prevStatus = beforeData && typeof beforeData.status === "string" ? beforeData.status : null;
    const nextStatus = typeof after.status === "string" ? after.status : "";
    logger.info("PO email trigger", {
        poId,
        prevStatus,
        nextStatus,
        functionsEmulator: process.env.FUNCTIONS_EMULATOR === "true",
        smtpVarsPresent: smtpEnvDiagnostics(),
    });
    const transporter = getTransporter();
    const from = process.env.SMTP_FROM || "";
    if (!transporter || !from) {
        logger.warn("PO email skipped: incomplete SMTP env. Set SMTP_HOST, SMTP_USER, SMTP_PASS, SMTP_FROM (use functions/.env when using emulators).", smtpEnvDiagnostics());
        return;
    }
    const label = poLabel(after, poId);
    const creatorName = typeof after.creatorName === "string" ? after.creatorName : "A team member";
    const total = typeof after.totalAmount === "number" ? after.totalAmount.toFixed(2) : "0.00";
    const creatorId = typeof after.creatorId === "string" ? after.creatorId : "";
    const { adminEmails, purchaserEmails } = await loadRecipientEmails();
    const creatorEmail = creatorId ? await getUserEmail(creatorId) : null;
    const creatorNorm = creatorEmail?.trim().toLowerCase() || "";
    // Submitted for approval (new or resubmitted)
    if (nextStatus === "pending_approval" && prevStatus !== "pending_approval") {
        const recipients = [...new Set([...adminEmails, ...purchaserEmails])].filter((e) => e.toLowerCase() !== creatorNorm);
        const html = `<p>${creatorName} submitted <strong>${label}</strong> for approval.</p>
        <p>Total: <strong>$${total}</strong></p>
        ${footerLinks()}`;
        if (recipients.length === 0) {
            logger.warn("New PO pending: no admin/purchaser recipients (check users collection has role admin or purchaser with email). Creator was excluded.", { poId, adminCount: adminEmails.length, purchaserCount: purchaserEmails.length });
        }
        for (const to of recipients) {
            try {
                await sendEmail({
                    transporter,
                    from,
                    to,
                    subject: `[PO] New request pending approval: ${label}`,
                    html,
                });
            }
            catch (e) {
                logger.error("Failed to send new-PO email", { to, error: String(e) });
            }
        }
        logger.info("New PO pending emails finished", { poId, count: recipients.length });
    }
    // Approved → purchasers + admins (approvers) + creator
    if (nextStatus === "approved" && prevStatus !== "approved") {
        const approvedBy = typeof after.approvedByName === "string" ? after.approvedByName : "An approver";
        const staffRecipients = [...new Set([...adminEmails, ...purchaserEmails])].filter((e) => e.toLowerCase() !== creatorNorm);
        const staffHtml = `<p><strong>${label}</strong> was approved by ${approvedBy}.</p>
        <p>Total: <strong>$${total}</strong>. It is ready for purchasing.</p>
        ${footerLinks()}`;
        for (const to of staffRecipients) {
            try {
                await sendEmail({
                    transporter,
                    from,
                    to,
                    subject: `[PO] Approved — ready to purchase: ${label}`,
                    html: staffHtml,
                });
            }
            catch (e) {
                logger.error("Failed to send approved email (staff)", { to, error: String(e) });
            }
        }
        if (creatorEmail) {
            const directorHtml = `<p>Your purchase order <strong>${label}</strong> was approved by ${approvedBy}.</p>
          <p>Total: <strong>$${total}</strong>.</p>
          ${footerLinks()}`;
            try {
                await sendEmail({
                    transporter,
                    from,
                    to: creatorEmail,
                    subject: `[PO] Your request was approved: ${label}`,
                    html: directorHtml,
                });
            }
            catch (e) {
                logger.error("Failed to send approved email (creator)", {
                    to: creatorEmail,
                    error: String(e),
                });
            }
        }
        logger.info("Approved PO emails sent", { poId, staff: staffRecipients.length, creator: !!creatorEmail });
    }
    // Purchased → creator (director / submitter)
    if (nextStatus === "purchased" && prevStatus !== "purchased") {
        if (!creatorEmail) {
            logger.warn("No creator email for purchased PO", { poId, creatorId });
            return;
        }
        const purchasedBy = typeof after.purchasedByName === "string"
            ? after.purchasedByName
            : "Purchasing";
        const html = `<p>Your purchase order <strong>${label}</strong> has been marked as <strong>purchased</strong> by ${purchasedBy}.</p>
        <p>Total: <strong>$${total}</strong>.</p>
        ${footerLinks()}`;
        try {
            await sendEmail({
                transporter,
                from,
                to: creatorEmail,
                subject: `[PO] Purchased: ${label}`,
                html,
            });
            logger.info("Purchased PO email sent", { poId, to: creatorEmail });
        }
        catch (e) {
            logger.error("Failed to send purchased email", { to: creatorEmail, error: String(e) });
        }
    }
});
//# sourceMappingURL=index.js.map