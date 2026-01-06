import fs from "fs";

(async function () {
  try {
    console.log("Iniciando comparación de pagos...\n");

    // Leer ambos archivos JSON
    const legacyPaymentsData = fs.readFileSync(
      "logs/all-legacy-payments.json",
      "utf8"
    );
    const paymentTicketsData = fs.readFileSync(
      "logs/all-payment-tickets.json",
      "utf8"
    );

    const legacyPayments = JSON.parse(legacyPaymentsData);
    const paymentTickets = JSON.parse(paymentTicketsData);

    console.log(`Total de pagos legacy: ${legacyPayments.length}`);
    console.log(`Total de tickets de pago: ${paymentTickets.length}\n`);

    // Crear sets para búsqueda rápida de payment_id e intent_id en tickets
    const ticketPaymentIds = new Set(
      paymentTickets.map((ticket) => ticket.payment_id).filter(Boolean)
    );
    const ticketIntentIds = new Set(
      paymentTickets.map((ticket) => ticket.intent_id).filter(Boolean)
    );

    console.log(`Payment IDs únicos en tickets: ${ticketPaymentIds.size}`);
    console.log(`Intent IDs únicos en tickets: ${ticketIntentIds.size}\n`);

    // Encontrar pagos legacy que NO están en tickets
    const missingPayments = [];
    const foundByIntentId = [];
    const foundByPaymentId = [];

    legacyPayments.forEach((payment) => {
      const paymentId = payment.payment_id;
      const intentId = payment.intent_id;

      const hasPaymentId = ticketPaymentIds.has(paymentId);
      const hasIntentId = ticketIntentIds.has(intentId);

      if (hasPaymentId && hasIntentId) {
        // Encontrado por ambos IDs
        foundByPaymentId.push({
          payment_id: paymentId,
          intent_id: intentId,
          match_type: "both",
        });
      } else if (hasPaymentId && !hasIntentId) {
        // Encontrado solo por payment_id
        foundByPaymentId.push({
          payment_id: paymentId,
          intent_id: intentId,
          match_type: "payment_id_only",
        });
      } else if (!hasPaymentId && hasIntentId) {
        // Encontrado solo por intent_id
        foundByIntentId.push({
          payment_id: paymentId,
          intent_id: intentId,
          match_type: "intent_id_only",
        });
      } else {
        // No encontrado en tickets
        missingPayments.push({
          payment_id: paymentId,
          intent_id: intentId,
          user_id: payment.user?.user_id || payment.user_id,
          loan_id: payment.loan_id,
          amount: payment.amount,
          bank: payment.bank,
          date: payment.date,
          created_at: payment.created_at,
          country: payment.country,
          reference: payment.reference,
        });
      }
    });

    // Generar resumen
    console.log("=== RESULTADOS DE LA COMPARACIÓN ===\n");
    console.log(
      `Pagos encontrados por payment_id (coincidencia exacta): ${
        foundByPaymentId.filter((p) => p.match_type === "both").length
      }`
    );
    console.log(
      `Pagos encontrados SOLO por payment_id: ${
        foundByPaymentId.filter((p) => p.match_type === "payment_id_only")
          .length
      }`
    );
    console.log(
      `Pagos encontrados SOLO por intent_id: ${foundByIntentId.length}`
    );
    console.log(`Pagos NO encontrados en tickets: ${missingPayments.length}\n`);

    // Guardar resultados en archivos separados
    const timestamp = Date.now();

    // 1. Pagos faltantes (NO encontrados en tickets)
    if (missingPayments.length > 0) {
      const missingFileName = `logs/missing-payments.json`;
      fs.writeFileSync(
        missingFileName,
        JSON.stringify(missingPayments, null, 2)
      );
      console.log(`✗ Pagos faltantes guardados en: ${missingFileName}`);
      console.log(`  Total: ${missingPayments.length} pagos\n`);

      // También generar un CSV simplificado para fácil revisión
      const csvFileName = `logs/missing-payments-${timestamp}.csv`;
      const csvHeader =
        "payment_id,intent_id,user_id,loan_id,amount,bank,date,country,reference\n";
      const csvRows = missingPayments
        .map(
          (p) =>
            `${p.payment_id},${p.intent_id},${p.user_id},${p.loan_id},${p.amount},${p.bank},${p.date},${p.country},${p.reference}`
        )
        .join("\n");
      fs.writeFileSync(csvFileName, csvHeader + csvRows);
      console.log(`✗ CSV de pagos faltantes: ${csvFileName}\n`);
    } else {
      console.log("✓ No hay pagos faltantes. Todos están en tickets.\n");
    }

    // 2. Pagos encontrados solo por intent_id (posible discrepancia)
    if (foundByIntentId.length > 0) {
      const intentOnlyFileName = `logs/found-by-intent-only-${timestamp}.json`;
      fs.writeFileSync(
        intentOnlyFileName,
        JSON.stringify(foundByIntentId, null, 2)
      );
      console.log(
        `⚠ Pagos encontrados SOLO por intent_id: ${intentOnlyFileName}`
      );
      console.log(
        `  Total: ${foundByIntentId.length} pagos (revisar discrepancias en payment_id)\n`
      );
    }

    // 3. Estadísticas adicionales
    const statsFileName = `logs/comparison-stats-${timestamp}.json`;
    const stats = {
      timestamp: new Date().toISOString(),
      legacy_payments_total: legacyPayments.length,
      payment_tickets_total: paymentTickets.length,
      found_by_both: foundByPaymentId.filter((p) => p.match_type === "both")
        .length,
      found_by_payment_id_only: foundByPaymentId.filter(
        (p) => p.match_type === "payment_id_only"
      ).length,
      found_by_intent_id_only: foundByIntentId.length,
      missing_payments: missingPayments.length,
      unique_payment_ids_in_tickets: ticketPaymentIds.size,
      unique_intent_ids_in_tickets: ticketIntentIds.size,
    };
    fs.writeFileSync(statsFileName, JSON.stringify(stats, null, 2));
    console.log(`📊 Estadísticas guardadas en: ${statsFileName}\n`);

    // Resumen final
    console.log("=== RESUMEN FINAL ===");
    console.log(`Total de pagos legacy: ${legacyPayments.length}`);
    console.log(
      `Total encontrados en tickets: ${
        legacyPayments.length - missingPayments.length
      }`
    );
    console.log(`Total NO encontrados: ${missingPayments.length}`);
    console.log(
      `Porcentaje de cobertura: ${(
        ((legacyPayments.length - missingPayments.length) /
          legacyPayments.length) *
        100
      ).toFixed(2)}%`
    );

    if (missingPayments.length > 0) {
      console.log(
        `\n⚠️  ATENCIÓN: Hay ${missingPayments.length} pagos que NO están en los tickets.`
      );
      console.log(
        `Revisa el archivo logs/missing-payments-${timestamp}.json para más detalles.`
      );
    } else {
      console.log("\n✅ Todos los pagos legacy están presentes en tickets.");
    }
  } catch (error) {
    console.error("Error durante la comparación:", error.message);
    if (error.code === "ENOENT") {
      console.error(
        "\nAsegúrate de que los archivos existan en la carpeta logs/:"
      );
      console.error("  - logs/all-legacy-payments.json");
      console.error("  - logs/all-payment-tickets.json");
    }
  }
})();
