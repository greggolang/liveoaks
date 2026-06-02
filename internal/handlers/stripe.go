package handlers

import (
	"encoding/json"
	"io"
	"net/http"

	"github.com/jackc/pgx/v5/pgxpool"
	"github.com/labstack/echo/v4"
	"github.com/stripe/stripe-go/v82"
	"github.com/stripe/stripe-go/v82/paymentintent"
	"github.com/stripe/stripe-go/v82/webhook"
)

type StripeHandler struct {
	DB             *pgxpool.Pool
	SecretKey      string
	WebhookSecret  string
	PublishableKey string
}

func (h *StripeHandler) Config(c echo.Context) error {
	return c.JSON(http.StatusOK, map[string]string{
		"publishable_key": h.PublishableKey,
	})
}

func (h *StripeHandler) CreatePaymentIntent(c echo.Context) error {
	userID := c.Get("user_id").(string)
	dueID := c.Param("id")

	var amount float64
	err := h.DB.QueryRow(c.Request().Context(),
		`SELECT amount FROM dues WHERE id = $1 AND user_id = $2 AND status = 'unpaid'`,
		dueID, userID).Scan(&amount)
	if err != nil {
		return echo.NewHTTPError(http.StatusNotFound, "due not found")
	}

	stripe.Key = h.SecretKey
	params := &stripe.PaymentIntentParams{
		Amount:   stripe.Int64(int64(amount * 100)),
		Currency: stripe.String("usd"),
		Metadata: map[string]string{
			"due_id":  dueID,
			"user_id": userID,
		},
	}
	pi, err := paymentintent.New(params)
	if err != nil {
		return echo.NewHTTPError(http.StatusInternalServerError, "could not create payment intent")
	}

	return c.JSON(http.StatusOK, map[string]string{
		"client_secret": pi.ClientSecret,
	})
}

func (h *StripeHandler) Webhook(c echo.Context) error {
	body, err := io.ReadAll(c.Request().Body)
	if err != nil {
		return echo.NewHTTPError(http.StatusBadRequest, "could not read body")
	}

	sig := c.Request().Header.Get("Stripe-Signature")
	event, err := webhook.ConstructEvent(body, sig, h.WebhookSecret)
	if err != nil {
		return echo.NewHTTPError(http.StatusBadRequest, "invalid signature")
	}

	if event.Type == "payment_intent.succeeded" {
		var pi stripe.PaymentIntent
		if err := json.Unmarshal(event.Data.Raw, &pi); err != nil {
			return echo.NewHTTPError(http.StatusBadRequest, "could not parse event")
		}
		if dueID := pi.Metadata["due_id"]; dueID != "" {
			h.DB.Exec(c.Request().Context(),
				`UPDATE dues SET status = 'paid', paid_at = NOW() WHERE id = $1 AND status = 'unpaid'`,
				dueID)
		}
	}

	return c.JSON(http.StatusOK, map[string]string{"received": "true"})
}
