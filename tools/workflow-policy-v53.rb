#!/usr/bin/env ruby
# frozen_string_literal: true
# AssetTrust v0.53: real YAML parser + semantic CI contract. No dependencies beyond Ruby/Psych.
# Read-only: this is NOT evidence that GitHub Actions or a production deployment executed.
require 'psych'
require 'json'
require 'pathname'

module AssetTrustWorkflowPolicyV53
  module_function

  def duplicate_keys!(node, context = 'document')
    if node.is_a?(Psych::Nodes::Alias)
      raise "YAML aliases are not allowed at #{context}"
    end
    if node.is_a?(Psych::Nodes::Mapping)
      keys = {}
      node.children.each_slice(2) do |key, value|
        raise "Non-scalar YAML key at #{context}" unless key.is_a?(Psych::Nodes::Scalar)
        name = key.value
        raise "Duplicate YAML key #{name.inspect} at #{context}" if keys.key?(name)
        keys[name] = true
        duplicate_keys!(value, "#{context}.#{name}")
      end
    elsif node.respond_to?(:children)
      Array(node.children).each { |child| duplicate_keys!(child, context) }
    end
  end

  def check(file, manifest)
    issues = []
    begin
      bytes = File.read(file)
      ast = Psych.parse_stream(bytes, filename: file.to_s)
      duplicate_keys!(ast)
      workflow = Psych.safe_load(bytes, aliases: false)
    rescue StandardError => e
      return { schema: 'ASSETTRUST_WORKFLOW_POLICY_V53', ok: false, issues: ["Invalid workflow YAML: #{e.class}: #{e.message.lines.first.to_s.strip}"] }
    end
    unless workflow.is_a?(Hash)
      return { schema: 'ASSETTRUST_WORKFLOW_POLICY_V53', ok: false, issues: ['Workflow must be a mapping'] }
    end
    triggers = workflow['on'] || workflow[true] # Psych YAML 1.1 recognizes 'on' as boolean true.
    issues << 'Both push and pull_request triggers required' unless triggers.is_a?(Hash) && triggers.key?('push') && triggers.key?('pull_request')
    job = workflow.fetch('jobs', {})['integration'] rescue nil
    unless job.is_a?(Hash)
      return { schema: 'ASSETTRUST_WORKFLOW_POLICY_V53', ok: false, issues: issues + ['integration job missing'] }
    end
    services = job['services']
    issues << 'PostGIS service required' unless services.is_a?(Hash) && services.dig('postgres', 'image').to_s.start_with?('postgis/postgis:')
    issues << 'ClamAV service required' unless services.is_a?(Hash) && services.dig('clamav', 'image').to_s.start_with?('clamav/clamav:')
    issues << 'Local-only ClamAV CI port required' unless job.fetch('env', {}).fetch('CLAMAV_TCP_PORT', '').to_s == '3310'
    issues << 'CI DATABASE_URL must be local disposable database' unless job.fetch('env', {}).fetch('DATABASE_URL', '').to_s.match?(%r{^postgres(?:ql)?://[^\s]+@127\.0\.0\.1:5432/[\w]+_(?:ci|test)$})
    steps = job['steps']
    unless steps.is_a?(Array)
      return { schema: 'ASSETTRUST_WORKFLOW_POLICY_V53', ok: false, issues: issues + ['Job steps must be a sequence'] }
    end
    steps.each_with_index do |step, index|
      unless step.is_a?(Hash) && !!step.key?('run') != !!step.key?('uses')
        issues << "step #{index + 1} must define exactly one of run/uses"
        next
      end
      issues << "step #{index + 1} has invalid env" if step.key?('env') && !step['env'].is_a?(Hash)
      issues << "step #{index + 1} silently ignores failures" if step['continue-on-error'] == true
      if step['run'].is_a?(String)
        issues << "step #{index + 1} uses fail-open shell behavior" if step['run'].match?(/\|\|\s*true\b/)
        if step['run'].match?(/(?:^|\n)\s*npm run test:pg:[\w:.-]+/)
          env = job.fetch('env', {}).merge(step.fetch('env', {}))
          issues << "step #{index + 1} lacks disposable PostgreSQL mutation authorization" unless ['YES', true].include?(env['ASSETTRUST_E2E_ALLOW_MUTATION'])
        end
      end
    end
    runs = steps.filter_map { |s| s['run'] if s.is_a?(Hash) && s['run'].is_a?(String) }
    commands = runs.flat_map { |run| run.lines.map(&:strip) }.reject { |line| line.start_with?('#') }
    executed = commands.filter_map { |line| line[/\Anpm run ([\w:.-]+)(?:\s|$)/, 1] }
    scripts = manifest.fetch('scripts', {})
    versions = scripts.keys.grep(/\Averify:v\d{2}\z/).sort
    pg_scripts = scripts.keys.grep(/\Atest:pg:/).sort
    (versions + pg_scripts + %w[verify:ci:v41 verify:ci:v53 supply-chain:v51]).each do |script|
      issues << "Missing executable CI command: npm run #{script}" unless executed.include?(script)
    end
    issues << 'Missing live ClamAV command' unless commands.any? { |line| line.match?(/(?:\A|\s)npm run security:clamav:v52(?:\s|;|$)/) }
    issues << 'Missing batched whole-history Git scan' unless executed.include?('security:scan:v54')
    issues << 'GitHub Actions must invoke Ruby YAML validation before npm ci' unless commands.any? { |line| line == 'ruby tools/workflow-policy-v53.rb' }
    ci_install = commands.index('npm ci')
    yaml_check = commands.index('ruby tools/workflow-policy-v53.rb')
    issues << 'npm ci must follow YAML workflow verification' unless ci_install && yaml_check && yaml_check < ci_install
    issues << 'npm audit high/critical gate absent' unless commands.any? { |line| line.start_with?('npm audit --omit=dev --audit-level=high') }
    issues << 'Both API and web must compile' unless commands.any? { |line| line == 'npm run build' }
    issues << 'Complete history secret scan absent' unless commands.any? { |line| line == 'npm run security:scan:v43 -- --history' }
    checkout = steps.find { |step| step.is_a?(Hash) && step['uses'].to_s.start_with?('actions/checkout@') }
    issues << 'Git checkout must fetch full history for secret scan' unless checkout && checkout.fetch('with', {}).fetch('fetch-depth', -1).to_s == '0'
    issues << 'npm install cannot replace npm ci' if commands.any? { |line| line.match?(/\Anpm (?:install|i)(?:\s|$)/) }
    issues << 'No continue-on-error true allowed' if steps.any? { |step| step.is_a?(Hash) && step['continue-on-error'] == true }
    {
      schema: 'ASSETTRUST_WORKFLOW_POLICY_V53', ok: issues.empty?,
      versionSuiteCount: versions.length, pgContractCount: pg_scripts.length,
      issues: issues
    }
  end
end

if __FILE__ == $PROGRAM_NAME
  path = ARGV[0] || File.expand_path('../.github/workflows/ci.yml', __dir__)
  manifest_path = File.expand_path('../package.json', __dir__)
  begin
    result = AssetTrustWorkflowPolicyV53.check(path, JSON.parse(File.read(manifest_path)))
    puts JSON.pretty_generate(result)
    exit(result[:ok] ? 0 : 1)
  rescue StandardError => e
    warn "BLOCKED: Cannot verify workflow policy: #{e.class}: #{e.message.lines.first.to_s.strip}"
    exit 1
  end
end
