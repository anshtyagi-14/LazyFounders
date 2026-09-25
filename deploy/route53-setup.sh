#!/usr/bin/env bash
# Move lazyfounder.in from GoDaddy DNS to Route53 and put the site on HTTPS.
#
# Needs credentials with route53:*, acm:* and elasticloadbalancing:* on account
# 248746142729. The github-action user has none of those.
#
#   AWS_PROFILE=<admin-profile> bash deploy/route53-setup.sh
#
# Safe to re-run: every step checks for what it already created. Nothing here
# touches the registrar, so the domain keeps resolving through GoDaddy until
# you change the nameservers by hand at the very end.
set -euo pipefail

DOMAIN="${DOMAIN:-lazyfounder.in}"
AWS_REGION="${AWS_REGION:-ap-south-1}"
ALB_NAME="${ALB_NAME:-lf-dashboard-alb}"

# Route53/ACM and the load balancer may need different credentials: on this
# account dhando-dev has route53 and acm but no elasticloadbalancing, while
# github-action has the reverse. Set ELB_AWS_PROFILE to the profile that can
# read and modify the ALB; unset, the current credentials are used for both.
ELB_AWS_PROFILE="${ELB_AWS_PROFILE:-}"
elb_aws() {
  if [ -n "$ELB_AWS_PROFILE" ]; then aws --profile "$ELB_AWS_PROFILE" "$@"; else aws "$@"; fi
}

# --dns-only stops after the records are written, before anything touches the
# load balancer. The certificate cannot validate until the registrar points at
# Route53 anyway, so this is the useful first pass.
DNS_ONLY=false
for arg in "$@"; do [ "$arg" = "--dns-only" ] && DNS_ONLY=true; done

# Scratch files are read back by the Windows builds of python and aws, which do
# not understand an MSYS path like /tmp/x.json, so hand them a native path.
TMPD="$(mktemp -d)"
trap 'rm -rf "$TMPD"' EXIT
native() { if command -v cygpath >/dev/null 2>&1; then cygpath -w "$1"; else printf '%s' "$1"; fi; }

echo "Domain=$DOMAIN Region=$AWS_REGION DnsOnly=$DNS_ONLY"

# --- 1. Hosted zone -----------------------------------------------------------
ZONE_ID="$(aws route53 list-hosted-zones-by-name --dns-name "$DOMAIN" \
  --query "HostedZones[?Name=='$DOMAIN.'].Id | [0]" --output text)"

if [ "$ZONE_ID" = "None" ] || [ -z "$ZONE_ID" ]; then
  echo "Creating hosted zone for $DOMAIN"
  ZONE_ID="$(aws route53 create-hosted-zone --name "$DOMAIN" \
    --caller-reference "lf-$(date +%s)" \
    --hosted-zone-config "Comment=LazyFounders public site" \
    --query 'HostedZone.Id' --output text)"
else
  echo "Hosted zone already exists"
fi
ZONE_ID="${ZONE_ID#/hostedzone/}"
echo "Zone: $ZONE_ID"

# --- 2. Certificate -----------------------------------------------------------
# An ALB can only use a certificate from its own region, so this must be
# ap-south-1 - the blogy.in certs on this account do not cover $DOMAIN.
CERT_ARN="$(aws acm list-certificates --region "$AWS_REGION" \
  --query "CertificateSummaryList[?DomainName=='$DOMAIN'].CertificateArn | [0]" --output text)"

if [ "$CERT_ARN" = "None" ] || [ -z "$CERT_ARN" ]; then
  echo "Requesting certificate for $DOMAIN and www.$DOMAIN"
  CERT_ARN="$(aws acm request-certificate --region "$AWS_REGION" \
    --domain-name "$DOMAIN" \
    --subject-alternative-names "www.$DOMAIN" \
    --validation-method DNS \
    --query 'CertificateArn' --output text)"
  # ACM populates the validation records a moment after the request lands.
  sleep 15
else
  echo "Certificate already requested"
fi
echo "Cert: $CERT_ARN"

# --- 3. DNS validation records ------------------------------------------------
echo "Writing certificate validation records"
aws acm describe-certificate --region "$AWS_REGION" --certificate-arn "$CERT_ARN" \
  --query 'Certificate.DomainValidationOptions[].ResourceRecord' --output json \
  | python -c "
import json, sys
seen, changes = set(), []
for r in json.load(sys.stdin) or []:
    if not r or r['Name'] in seen:
        continue
    seen.add(r['Name'])
    changes.append({'Action': 'UPSERT', 'ResourceRecordSet': {
        'Name': r['Name'], 'Type': r['Type'], 'TTL': 300,
        'ResourceRecords': [{'Value': r['Value']}]}})
json.dump({'Comment': 'ACM validation', 'Changes': changes}, sys.stdout)
" > "$TMPD/acm-validation.json"

VALIDATION_JSON="$(native "$TMPD/acm-validation.json")"
if [ "$(python -c "import json,sys;print(len(json.load(open(sys.argv[1]))['Changes']))" "$VALIDATION_JSON")" -gt 0 ]; then
  aws route53 change-resource-record-sets --hosted-zone-id "$ZONE_ID" \
    --change-batch "file://$VALIDATION_JSON" --query 'ChangeInfo.Status' --output text
else
  echo "  (no validation records pending)"
fi

# --- 4. Site records ----------------------------------------------------------
# The apex cannot be a CNAME, so both names use Route53 alias A records that
# point straight at the load balancer.
# Both can be passed in, so the record step works with credentials that have
# Route53 but no elasticloadbalancing access.
ALB_DNS="${ALB_DNS:-$(elb_aws elbv2 describe-load-balancers --names "$ALB_NAME" --region "$AWS_REGION" \
  --query 'LoadBalancers[0].DNSName' --output text)}"
ALB_ZONE="${ALB_ZONE:-$(elb_aws elbv2 describe-load-balancers --names "$ALB_NAME" --region "$AWS_REGION" \
  --query 'LoadBalancers[0].CanonicalHostedZoneId' --output text)}"
echo "ALB: $ALB_DNS ($ALB_ZONE)"

alias_record() {
  printf '{"Action":"UPSERT","ResourceRecordSet":{"Name":"%s","Type":"A","AliasTarget":{"HostedZoneId":"%s","DNSName":"%s","EvaluateTargetHealth":true}}}' \
    "$1" "$ALB_ZONE" "$ALB_DNS"
}

cat > "$TMPD/site-records.json" <<JSON
{
  "Comment": "LazyFounders site records",
  "Changes": [
    $(alias_record "$DOMAIN"),
    $(alias_record "www.$DOMAIN"),
    {
      "Action": "UPSERT",
      "ResourceRecordSet": {
        "Name": "_dmarc.$DOMAIN",
        "Type": "TXT",
        "TTL": 3600,
        "ResourceRecords": [
          {"Value": "\"v=DMARC1; p=quarantine; adkim=r; aspf=r; rua=mailto:dmarc_rua@onsecureserver.net;\""}
        ]
      }
    }
  ]
}
JSON

echo "Writing site records"
aws route53 change-resource-record-sets --hosted-zone-id "$ZONE_ID" \
  --change-batch "file://$(native "$TMPD/site-records.json")" --query 'ChangeInfo.Status' --output text

# --- 5. Certificate and listener ---------------------------------------------
if [ "$DNS_ONLY" = true ]; then
  echo "--dns-only: stopping before the load balancer."
else
  # Validation only completes once the registrar points at Route53, so this will
  # sit here on a first run. Ctrl-C is fine; re-run the script after the switch.
  # --- 6. Listeners -----------------------------------------------------------
  #
  # The site has to answer on exactly one origin. Four were reachable and all
  # served 200: http and https, each on the apex and on www. Everything below
  # collapses them onto https://$DOMAIN.
  ALB_ARN="$(elb_aws elbv2 describe-load-balancers --names "$ALB_NAME" --region "$AWS_REGION" \
    --query 'LoadBalancers[0].LoadBalancerArn' --output text)"
  TG_ARN="$(elb_aws elbv2 describe-target-groups --names lf-dashboard-tg --region "$AWS_REGION" \
    --query 'TargetGroups[0].TargetGroupArn' --output text)"

  # This runs before the certificate wait, not inside it. It used to sit in the
  # validated branch, so on any run that did not reach that branch - a Ctrl-C at
  # the wait, or an HTTPS listener created by hand afterwards - port 80 was left
  # serving the site instead of redirecting, which is how it ended up answering
  # 200 in production.
  HTTP_ARN="$(elb_aws elbv2 describe-listeners --load-balancer-arn "$ALB_ARN" --region "$AWS_REGION" \
    --query "Listeners[?Port==\`80\`].ListenerArn | [0]" --output text)"
  if [ "$HTTP_ARN" != "None" ] && [ -n "$HTTP_ARN" ]; then
    echo "Redirecting HTTP:80 to HTTPS"
    elb_aws elbv2 modify-listener --region "$AWS_REGION" --listener-arn "$HTTP_ARN" \
      --default-actions 'Type=redirect,RedirectConfig={Protocol=HTTPS,Port=443,StatusCode=HTTP_301}' \
      --query 'Listeners[0].ListenerArn' --output text
  fi

  # Validation only completes once the registrar points at Route53, so this will
  # sit here on a first run. Ctrl-C is fine; re-run the script after the switch.
  echo "Waiting for certificate validation (Ctrl-C if nameservers are still at GoDaddy)..."
  if aws acm wait certificate-validated --region "$AWS_REGION" --certificate-arn "$CERT_ARN"; then
    HTTPS_ARN="$(elb_aws elbv2 describe-listeners --load-balancer-arn "$ALB_ARN" --region "$AWS_REGION" \
      --query "Listeners[?Port==\`443\`].ListenerArn | [0]" --output text)"

    if [ "$HTTPS_ARN" = "None" ] || [ -z "$HTTPS_ARN" ]; then
      echo "Creating HTTPS:443 listener"
      elb_aws elbv2 create-listener --region "$AWS_REGION" \
        --load-balancer-arn "$ALB_ARN" --protocol HTTPS --port 443 \
        --certificates "CertificateArn=$CERT_ARN" \
        --ssl-policy ELBSecurityPolicy-TLS13-1-2-2021-06 \
        --default-actions "Type=forward,TargetGroupArn=$TG_ARN" \
        --query 'Listeners[0].ListenerArn' --output text
      HTTPS_ARN="$(elb_aws elbv2 describe-listeners --load-balancer-arn "$ALB_ARN" --region "$AWS_REGION" \
        --query "Listeners[?Port==\`443\`].ListenerArn | [0]" --output text)"
    else
      echo "HTTPS listener already exists"
    fi

    # www -> apex, 301, path and query preserved. The certificate already covers
    # both names (see the SANs above) and both are alias records to this ALB, so
    # without this rule the whole site is duplicated under www.
    WWW_RULE_ARN="$(elb_aws elbv2 describe-rules --listener-arn "$HTTPS_ARN" --region "$AWS_REGION" \
      --query "Rules[?Priority=='10'].RuleArn | [0]" --output text)"
    WWW_ACTION="Type=redirect,RedirectConfig={Protocol=HTTPS,Host=$DOMAIN,Port=443,Path=/#{path},Query=#{query},StatusCode=HTTP_301}"
    if [ "$WWW_RULE_ARN" = "None" ] || [ -z "$WWW_RULE_ARN" ]; then
      echo "Creating www -> apex redirect rule"
      elb_aws elbv2 create-rule --region "$AWS_REGION" --listener-arn "$HTTPS_ARN" --priority 10 \
        --conditions "Field=host-header,Values=www.$DOMAIN" \
        --actions "$WWW_ACTION" \
        --query 'Rules[0].RuleArn' --output text
    else
      echo "Updating www -> apex redirect rule"
      elb_aws elbv2 modify-rule --region "$AWS_REGION" --rule-arn "$WWW_RULE_ARN" \
        --conditions "Field=host-header,Values=www.$DOMAIN" \
        --actions "$WWW_ACTION" \
        --query 'Rules[0].RuleArn' --output text
    fi
  fi
fi

# --- 7. What you still have to do by hand ------------------------------------
echo
echo "=============================================================="
echo "Set these nameservers on $DOMAIN at GoDaddy:"
aws route53 get-hosted-zone --id "$ZONE_ID" --query 'DelegationSet.NameServers[]' --output text | tr '\t' '\n' | sed 's/^/  /'
echo
echo "Until that change propagates, $DOMAIN keeps resolving through GoDaddy"
echo "and the certificate cannot finish validating. Re-run this script"
echo "afterwards to create the HTTPS listener."
echo
echo "Then point the app at the domain:"
echo "  deploy/.env.production:"
echo "    NEXT_PUBLIC_SITE_URL=https://$DOMAIN"
echo "    REVALIDATE_URL=https://$DOMAIN/api/revalidate"
echo "  node deploy/update-task-defs.mjs --deploy"
echo "=============================================================="
