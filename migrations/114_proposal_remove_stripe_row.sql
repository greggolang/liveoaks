-- Remove the Stripe payment processing row from the board-meeting proposal.
UPDATE collab_documents
SET
  body = replace(
    replace(
      body,
      '<tr><td>Stripe payment processing</td><td>2.9% + $0.30 per card transaction</td><td>Applies only when members pay dues by credit/debit card. If $50,000 in annual dues flow through Stripe, the fee is approximately $1,500/yr. The board may add a small convenience fee to offset this, or absorb it as a club expense.</td></tr>',
      ''
    ),
    '<tr><td><strong>Fixed monthly total</strong></td><td><strong>$350 / mo ($4,200/yr)</strong></td><td>Stripe fees are separate and vary with card payment volume.</td></tr>',
    '<tr><td><strong>Total</strong></td><td><strong>$350 / mo ($4,200/yr)</strong></td><td></td></tr>'
  ),
  version    = version + 1,
  updated_at = NOW()
WHERE id = '00000000-0000-0000-0000-0000000000aa';
