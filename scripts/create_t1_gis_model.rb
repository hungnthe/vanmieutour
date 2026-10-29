require 'json'
require 'sketchup.rb'

INPUT = 'D:/TourVanMieu/dau-chan-di-san-codex-handoff/heritage-map/artifacts/t1_skp_data.json'
OUTPUT = 'D:/TourVanMieu/VanMieu_T1_GIS.skp'
data = JSON.parse(File.read(INPUT, encoding: 'UTF-8'))
model = Sketchup.active_model
model.start_operation('Build T1 GIS overview', true)
begin
  model.entities.clear!
  model.layers.each { |layer| model.layers.remove(layer) unless layer.name == 'Layer0' }
  model.materials.clear!
  model.title = 'Văn Miếu · mô hình GIS từ T1'
  model.set_attribute('T1_GIS', 'source_folder', data.dig('metadata', 'source'))
  model.set_attribute('T1_GIS', 'projection', data.dig('metadata', 'projection'))
  model.set_attribute('T1_GIS', 'data_note', data.dig('metadata', 'warning'))
  model.set_attribute('T1_GIS', 'built_at', Time.now.strftime('%Y-%m-%d'))

  tag_for = lambda do |name|
    model.layers[name] || model.layers.add(name)
  end
  material_for = lambda do |name, rgb, alpha=1.0|
    material = model.materials[name] || model.materials.add(name)
    material.color = Sketchup::Color.new(*rgb)
    material.alpha = alpha
    material
  end
  point3 = lambda do |xy, z|
    Geom::Point3d.new(xy[0].to_f.m, xy[1].to_f.m, z.to_f.m)
  end
  add_paths = lambda do |entities, paths, z, material|
    paths.each do |path|
      next unless path && path.length > 1
      pts = path.map { |xy| point3.call(xy, z) }
      edges = entities.add_edges(pts)
      edges.each { |edge| edge.material = material }
    end
  end
  new_layer_group = lambda do |name, layer_name, hidden=false|
    g = model.entities.add_group
    g.name = name
    g.layer = tag_for.call(layer_name)
    g.hidden = hidden
    g
  end

  # Soft water fills; hide internal triangulation edges and draw clean perimeters separately.
  water_group = new_layer_group.call('01 · Mặt nước (lớp nuoc)', 'T1 · Mặt nước')
  water_material = material_for.call('Nước · xanh lam dịu', [91, 174, 184], 0.82)
  data['water_faces'].each do |triangle|
    pts = triangle.map { |xy| point3.call(xy, 0.2) }
    face = water_group.entities.add_face(pts)
    next unless face
    face.reverse! if face.normal.z < 0
    face.material = water_material
    face.back_material = water_material
    face.edges.each { |edge| edge.hidden = true; edge.soft = true; edge.smooth = true }
  end
  water_outline = material_for.call('Nước · viền', [71, 144, 157])
  add_paths.call(water_group.entities, data['water_outlines'], 0.35, water_outline)

  road_group = new_layer_group.call('02 · Mạng đường (1.107 đoạn)', 'T1 · Mạng đường')
  road_colors = {
    'primary' => [167, 91, 65], 'primary_link' => [184, 117, 77],
    'secondary' => [180, 128, 82], 'secondary_link' => [196, 151, 103],
    'tertiary' => [191, 155, 116], 'residential' => [88, 109, 113],
    'service' => [117, 135, 134], 'footway' => [142, 154, 146],
    'pedestrian' => [171, 160, 132], 'path' => [153, 163, 139],
    'steps' => [177, 147, 119], 'cycleway' => [114, 153, 150],
    'other' => [110, 125, 128]
  }
  data['roads'].each do |road_class, paths|
    color = road_colors[road_class] || road_colors['other']
    mat = material_for.call("Đường · #{road_class}", color)
    add_paths.call(road_group.entities, paths, 0.8, mat)
  end

  rail_group = new_layer_group.call('03 · Đường sắt (duongtau)', 'T1 · Đường sắt')
  rail_material = material_for.call('Đường sắt · than xanh', [61, 74, 86])
  add_paths.call(rail_group.entities, data['railways_area'], 1.5, rail_material)

  boundary_group = new_layer_group.call('04 · Ranh giới nguồn QTG_RanhGioi', 'T1 · Ranh giới')
  boundary_material = material_for.call('Ranh giới · vàng', [211, 161, 72])
  add_paths.call(boundary_group.entities, data['boundary'], 2.3, boundary_material)

  supplemental_group = new_layer_group.call('05 · Ranh giới bổ sung ranhgioi (UTM)', 'T1 · Ranh giới bổ sung', true)
  supplemental_material = material_for.call('Ranh giới bổ sung · xanh ngọc', [64, 169, 151])
  add_paths.call(supplemental_group.entities, data['boundary_supplementary'], 2.6, supplemental_material)

  context_group = new_layer_group.call('06 · Đường sắt ngữ cảnh (ẩn, đã cắt theo ranh nguồn)', 'T1 · Ngữ cảnh đường sắt', true)
  context_material = material_for.call('Đường sắt ngữ cảnh · xám', [153, 162, 165])
  add_paths.call(context_group.entities, data['railways_context'], 1.9, context_material)

  point_tag = tag_for.call('T1 · Điểm tham chiếu (cần đối soát)')
  point_material = material_for.call('Điểm tham chiếu · đất nung', [181, 91, 67])
  point_top = material_for.call('Điểm tham chiếu · vàng nhạt', [244, 204, 132])
  data['points'].each_with_index do |point, index|
    x, y = point['xy']
    name = point['name'].to_s.strip
    index_text = format('%02d', index + 1)
    marker = model.entities.add_group
    marker.name = "#{index_text} · #{name.empty? ? 'Điểm QTG_Diem' : name}"
    marker.layer = point_tag
    marker.set_attribute('T1_GIS', 'source_layer', 'QTG_Diem')
    marker.set_attribute('T1_GIS', 'source_name', name)
    marker.set_attribute('T1_GIS', 'source_order', index + 1)
    marker.set_attribute('T1_GIS', 'verification', 'Điểm tham chiếu từ tệp nguồn; cần đối soát')
    center = point3.call([x, y], 3.3)
    circle = marker.entities.add_circle(center, Geom::Vector3d.new(0, 0, 1), 4.0.m, 16)
    face = marker.entities.add_face(circle)
    if face
      face.reverse! if face.normal.z < 0
      face.material = point_material
      face.pushpull(6.0.m)
      face.material = point_top
      face.back_material = point_material
    end
    marker.entities.grep(Sketchup::Edge).each { |edge| edge.material = point_material }
  end

  model.active_view.camera = Sketchup::Camera.new(
    Geom::Point3d.new(1350.m, -1750.m, 2700.m),
    Geom::Point3d.new(0, 0, 0),
    Geom::Vector3d.new(0, 0, 1), true
  )
  model.active_view.zoom_extents
  model.commit_operation
  model.save(OUTPUT)
  puts "T1 GIS model saved: #{OUTPUT}"
  puts "Source points: #{data['points'].length}; roads: #{data['roads'].values.flatten(1).length}; water triangles: #{data['water_faces'].length}"
rescue Exception => error
  model.abort_operation
  puts "T1 GIS build failed: #{error.class}: #{error.message}"
  puts error.backtrace.first(8).join("\n")
  raise
end
